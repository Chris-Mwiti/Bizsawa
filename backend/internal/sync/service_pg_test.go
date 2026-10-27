package sync

// PostgreSQL-backed push tests for device-attributed last-write-wins.
// Needs a live database, so they skip unless TEST_DATABASE_URL is set:
//
//   TEST_DATABASE_URL='postgres://user:pass@localhost:5432/db?sslmode=disable' \
//     go test ./internal/sync/ -run 'TestPgPush' -v
//
// Migrations are applied from ../../migrations (includes 000023 record_writers).

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"testing"
	"time"

	gomigrate "github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/google/uuid"
	_ "github.com/jackc/pgx/v5/stdlib"
	gormpg "gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func pgSyncSetup(t *testing.T) (*Service, uuid.UUID, uuid.UUID) {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL unset — skipping Postgres sync tests")
	}

	migrationsPath, _ := filepath.Abs("../../migrations")
	m, err := gomigrate.New("file://"+migrationsPath, dsn)
	if err != nil {
		t.Fatalf("migrate new: %v", err)
	}
	if err := m.Up(); err != nil && err.Error() != "no change" {
		t.Fatalf("migrate up: %v", err)
	}
	m.Close()

	sqlDB, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { sqlDB.Close() })

	gdb, err := gorm.Open(gormpg.New(gormpg.Config{Conn: sqlDB}), &gorm.Config{})
	if err != nil {
		t.Fatalf("gorm open: %v", err)
	}

	ctx := context.Background()
	owner := uuid.New()
	bid := uuid.New()
	if err := gdb.WithContext(ctx).Exec(
		`INSERT INTO auth_users (id, email, password_hash) VALUES (?, ?, 'x')`, owner, "sync-pg-"+owner.String()[:8]+"@t.co").Error; err != nil {
		t.Fatalf("seed user: %v", err)
	}
	if err := gdb.WithContext(ctx).Exec(
		`INSERT INTO businesses (id, tenant_id, owner_id, name, slug) VALUES (?, ?, ?, 'pg', ?)`, bid, bid, owner, "pg-"+bid.String()[:8]).Error; err != nil {
		t.Fatalf("seed business: %v", err)
	}
	pid := uuid.New()
	if err := gdb.WithContext(ctx).Exec(
		`INSERT INTO products (id, tenant_id, business_id, name, price, cost, sync_version) VALUES (?, ?, ?, 'Widget', 100, 50, 1)`, pid, bid, bid).Error; err != nil {
		t.Fatalf("seed product: %v", err)
	}
	t.Cleanup(func() {
		gdb.Exec(`DELETE FROM businesses WHERE id = ?`, bid)
		gdb.Exec(`DELETE FROM auth_users WHERE id = ?`, owner)
	})

	return NewService(gdb), bid, pid
}

func pgPush(svc *Service, bid uuid.UUID, device string, table, id string, version int, fields map[string]any) *PushResult {
	rec := map[string]any{"id": id, "sync_version": version}
	for k, v := range fields {
		rec[k] = v
	}
	res, err := svc.Push(context.Background(), bid, PushRequest{
		Changes:  map[string]TableChanges{table: {Updated: []map[string]any{rec}}},
		DeviceID: &device,
	})
	if err != nil {
		panic(err)
	}
	return res
}

// Same device pushing twice (stale version on the retry) applies silently:
// no conflict row, id surfaces in lww_applied, audit row recorded.
func TestPgPushSameDeviceLWW(t *testing.T) {
	svc, bid, pid := pgSyncSetup(t)
	ctx := context.Background()
	id := pid.String()

	first := pgPush(svc, bid, "dev-a", "products", id, 1, map[string]any{"name": "Widget A"})
	if len(first.Conflicts) != 0 {
		t.Fatalf("first push should apply clean, got conflicts %v", first.Conflicts)
	}

	// Same device retries/edits again from the stale version it still holds.
	retry := pgPush(svc, bid, "dev-a", "products", id, 1, map[string]any{"name": "Widget A2"})
	if len(retry.Conflicts) != 0 {
		t.Fatalf("same-device retry should LWW-apply, got conflicts %v", retry.Conflicts)
	}
	if len(retry.LWWApplied["products"]) != 1 {
		t.Fatalf("expected lww_applied for products, got %v", retry.LWWApplied)
	}
	var name string
	if err := svc.db.WithContext(ctx).Raw(`SELECT name FROM products WHERE id = ?`, pid).Scan(&name).Error; err != nil || name != "Widget A2" {
		t.Fatalf("expected server name Widget A2, got %q (err %v)", name, err)
	}
	var audit int64
	if err := svc.db.WithContext(ctx).Raw(`SELECT COUNT(*) FROM lww_applications WHERE business_id = ? AND record_id = ? AND device_id = 'dev-a'`, bid, pid).Scan(&audit).Error; err != nil || audit != 1 {
		t.Fatalf("expected 1 lww audit row, got %d (err %v)", audit, err)
	}
}

// A different device pushing a stale version raises an explicit conflict
// carrying both device ids — the user resolves it on /sync-conflicts.
func TestPgPushOtherDeviceConflicts(t *testing.T) {
	svc, bid, pid := pgSyncSetup(t)
	ctx := context.Background()
	id := pid.String()

	pgPush(svc, bid, "dev-a", "products", id, 1, map[string]any{"name": "Widget A"})
	other := pgPush(svc, bid, "dev-b", "products", id, 1, map[string]any{"name": "Widget B"})
	if len(other.Conflicts) != 1 {
		t.Fatalf("expected 1 conflict, got %v", other.Conflicts)
	}
	c := other.Conflicts[0]
	if c.ClientDeviceID == nil || *c.ClientDeviceID != "dev-b" {
		t.Fatalf("conflict client device = %v, want dev-b", c.ClientDeviceID)
	}
	if c.ServerDeviceID == nil || *c.ServerDeviceID != "dev-a" {
		t.Fatalf("conflict server device = %v, want dev-a", c.ServerDeviceID)
	}
	var n int64
	if err := svc.db.WithContext(ctx).Raw(`SELECT COUNT(*) FROM conflicts WHERE business_id = ? AND record_id = ? AND resolved_at IS NULL`, bid, pid).Scan(&n).Error; err != nil || n != 1 {
		t.Fatalf("expected 1 unresolved conflict row, got %d (err %v)", n, err)
	}
}

// seedProducts inserts n products with distinct, strictly-increasing updated_at
// so paging has a deterministic order.
func seedProducts(t *testing.T, svc *Service, bid uuid.UUID, n int) []uuid.UUID {
	t.Helper()
	ctx := context.Background()
	ids := make([]uuid.UUID, 0, n)
	for i := 0; i < n; i++ {
		id := uuid.New()
		ids = append(ids, id)
		updatedAt := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC).Add(time.Duration(i) * time.Second)
		if err := svc.db.WithContext(ctx).Exec(
			`INSERT INTO products (id, tenant_id, business_id, name, price, cost, sync_version, updated_at) VALUES (?, ?, ?, ?, 100, 50, 1, ?)`,
			id, bid, bid, "Paged", updatedAt).Error; err != nil {
			t.Fatalf("seed product %d: %v", i, err)
		}
	}
	return ids
}

// A table larger than the per-table cap must report hasMore and a cursor, and
// paging with that cursor must drain every row exactly once (no silent loss,
// no lastPulledAt jump past unseen rows).
func TestPgPullPagesLargeTable(t *testing.T) {
	svc, bid, _ := pgSyncSetup(t)
	ctx := context.Background()

	const total = 7
	const cap = 3
	// The setup seeds one product; add the rest so the table has `total` rows.
	seedProducts(t, svc, bid, total-1)

	seen := map[string]bool{}
	cursor := ""
	pages := 0
	for {
		pages++
		if pages > 20 {
			t.Fatalf("paging did not terminate")
		}
		res, err := svc.PullPage(ctx, bid, time.Time{}, cap, cursor)
		if err != nil {
			t.Fatalf("pull: %v", err)
		}
		for _, row := range res.Changes["products"].Created {
			id, _ := row["id"].(string)
			if seen[id] {
				t.Fatalf("row %s emitted twice across pages", id)
			}
			seen[id] = true
		}
		for _, row := range res.Changes["products"].Updated {
			id, _ := row["id"].(string)
			if seen[id] {
				t.Fatalf("row %s emitted twice across pages", id)
			}
			seen[id] = true
		}
		if !res.HasMore {
			break
		}
		if res.Cursor == "" {
			t.Fatalf("hasMore with no cursor")
		}
		cursor = res.Cursor
	}

	if len(seen) != total {
		t.Fatalf("paged pull lost rows: saw %d, want %d", len(seen), total)
	}
	if pages < 3 {
		t.Fatalf("expected at least 3 pages for %d rows at cap %d, got %d", total, cap, pages)
	}
}

// A fully-drained pull (all tables under cap) must report hasMore=false and a
// timestamp at/after the newest row so the client may safely persist it.
func TestPgPullDrainedHasNoMore(t *testing.T) {
	svc, bid, _ := pgSyncSetup(t)
	ctx := context.Background()

	res, err := svc.PullWithLimit(ctx, bid, time.Time{}, DefaultPullLimit)
	if err != nil {
		t.Fatalf("pull: %v", err)
	}
	if res.HasMore {
		t.Fatalf("small dataset should not report hasMore")
	}
	if res.Cursor != "" {
		t.Fatalf("drained pull should carry no cursor, got %q", res.Cursor)
	}
	if res.Timestamp <= 0 {
		t.Fatalf("drained pull should return a usable timestamp, got %d", res.Timestamp)
	}
}
