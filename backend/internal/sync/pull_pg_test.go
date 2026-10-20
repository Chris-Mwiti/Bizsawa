package sync

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
)

// drainPull pages one pull session to the end, like the client does, and
// returns every live id and tombstone id per table plus the final timestamp.
func drainPull(t *testing.T, svc *Service, bid uuid.UUID, since time.Time, limit int) (map[string]map[string]int, map[string]map[string]int, int64) {
	t.Helper()
	live := map[string]map[string]int{}
	dead := map[string]map[string]int{}
	cursor := ""
	for page := 0; ; page++ {
		if page > 100 {
			t.Fatalf("pull session did not drain")
		}
		res, err := svc.PullPage(context.Background(), bid, since, limit, cursor)
		if err != nil {
			t.Fatalf("pull page %d: %v", page, err)
		}
		for table, tc := range res.Changes {
			if live[table] == nil {
				live[table], dead[table] = map[string]int{}, map[string]int{}
			}
			for _, r := range append(tc.Created, tc.Updated...) {
				live[table][r["id"].(string)]++
			}
			for _, id := range tc.Deleted {
				dead[table][id]++
			}
		}
		if !res.HasMore {
			return live, dead, res.Timestamp
		}
		cursor = res.Cursor
	}
}

func seedCustomersInOneTx(t *testing.T, svc *Service, bid uuid.UUID, n int) []string {
	t.Helper()
	ids := make([]string, n)
	tx := svc.db.Begin()
	for i := range ids {
		id := uuid.New()
		ids[i] = id.String()
		if err := tx.Exec(`INSERT INTO customers (id, tenant_id, business_id, name, sync_version) VALUES (?, ?, ?, 'C', 1)`, id, bid, bid).Error; err != nil {
			tx.Rollback()
			t.Fatalf("seed: %v", err)
		}
	}
	if err := tx.Commit().Error; err != nil {
		t.Fatalf("commit: %v", err)
	}
	return ids
}

// One offline backlog is pushed in one transaction, so every row shares
// updated_at (NOW() = tx start). A page boundary inside that tie must not
// skip the rest of it.
func TestPgPullPagingSurvivesTimestampTies(t *testing.T) {
	svc, bid, _ := pgSyncSetup(t)
	ids := seedCustomersInOneTx(t, svc, bid, 30)

	live, _, _ := drainPull(t, svc, bid, time.Time{}, 7)
	for _, id := range ids {
		if live["customers"][id] != 1 {
			t.Fatalf("customer %s delivered %d times, want exactly once (got %d/%d)", id, live["customers"][id], len(live["customers"]), len(ids))
		}
	}
}

// Two tables capped at different positions: resuming must continue each
// from its own position, never from the other table's.
func TestPgPullPagingTablesCappedAtDifferentPoints(t *testing.T) {
	svc, bid, _ := pgSyncSetup(t)
	ctx := context.Background()
	customers := seedCustomersInOneTx(t, svc, bid, 12)
	time.Sleep(20 * time.Millisecond)
	var expenses []string
	for i := 0; i < 25; i++ {
		id := uuid.New()
		expenses = append(expenses, id.String())
		if err := svc.db.WithContext(ctx).Exec(
			`INSERT INTO expenses (id, tenant_id, business_id, category, amount, tax_amount, spent_at, sync_version) VALUES (?, ?, ?, 'rent', 10, 0, NOW(), 1)`,
			id, bid, bid).Error; err != nil {
			t.Fatalf("seed expense: %v", err)
		}
	}

	live, _, _ := drainPull(t, svc, bid, time.Time{}, 5)
	if len(live["customers"]) != len(customers) || len(live["expenses"]) != len(expenses) {
		t.Fatalf("got %d/%d customers and %d/%d expenses", len(live["customers"]), len(customers), len(live["expenses"]), len(expenses))
	}
}

// Tombstones page with their own keyset, independent of live rows.
func TestPgPullPagingTombstones(t *testing.T) {
	svc, bid, _ := pgSyncSetup(t)
	ctx := context.Background()
	ids := seedCustomersInOneTx(t, svc, bid, 17)
	cutoff := time.Now().Add(-time.Second)
	if err := svc.db.WithContext(ctx).Exec(`UPDATE customers SET deleted_at = NOW(), updated_at = NOW() WHERE business_id = ?`, bid).Error; err != nil {
		t.Fatalf("delete: %v", err)
	}

	_, dead, _ := drainPull(t, svc, bid, cutoff, 4)
	for _, id := range ids {
		if dead["customers"][id] != 1 {
			t.Fatalf("tombstone %s delivered %d times (got %d/%d)", id, dead["customers"][id], len(dead["customers"]), len(ids))
		}
	}
}

// Rows are stamped updated_at = NOW() (transaction START). A pull that runs
// while that transaction is open must hand back a timestamp no later than its
// start, so the row — invisible now — is delivered by the next pull.
func TestPgPullDoesNotSkipRowsCommittedDuringPull(t *testing.T) {
	svc, bid, _ := pgSyncSetup(t)
	ctx := context.Background()

	tx := svc.db.WithContext(ctx).Begin()
	id := uuid.New()
	if err := tx.Exec(
		`INSERT INTO customers (id, tenant_id, business_id, name, sync_version) VALUES (?, ?, ?, 'Late', 1)`,
		id, bid, bid).Error; err != nil {
		tx.Rollback()
		t.Fatalf("insert: %v", err)
	}
	time.Sleep(50 * time.Millisecond)

	// Another device pulls (and drains) while the push transaction is open.
	mid, _, ts := drainPull(t, svc, bid, time.Time{}, DefaultPullLimit)
	if err := tx.Commit().Error; err != nil {
		t.Fatalf("commit: %v", err)
	}

	next, _, _ := drainPull(t, svc, bid, time.UnixMilli(ts), DefaultPullLimit)
	if mid["customers"][id.String()] == 0 && next["customers"][id.String()] == 0 {
		t.Fatalf("customer committed during a pull never reached the device: cursor %d is past its updated_at", ts)
	}
}
