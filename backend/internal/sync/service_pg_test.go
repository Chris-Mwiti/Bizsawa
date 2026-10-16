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
	"strings"
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

// A client sale for an order that already has a (server-derived) sale is
// rejected with a controlled duplicate error — never raw Postgres 23505 —
// and the rest of the batch still applies (no "transaction is aborted"
// poisoning of later records).
func TestPgPushDuplicateSaleForOrder(t *testing.T) {
	svc, bid, _ := pgSyncSetup(t)
	ctx := context.Background()

	orderID := uuid.New()
	// Parent must exist: validateFKs nulls out dangling order_id instead.
	if err := svc.db.WithContext(ctx).Exec(
		`INSERT INTO orders (id, tenant_id, business_id, status, subtotal, tax_amount, total, payment_method, sync_version) VALUES (?, ?, ?, 'fulfilled', 50, 8, 58, 'cash', 1)`,
		orderID, bid, bid).Error; err != nil {
		t.Fatalf("seed order: %v", err)
	}
	// Server-derived sale already on the books for this order.
	if err := svc.db.WithContext(ctx).Exec(
		`INSERT INTO sales (id, tenant_id, business_id, order_id, receipt_number, staff_id, payment_method, subtotal, tax_amount, total, status, sold_at, sync_version) VALUES (?, ?, ?, ?, 'RCPT-SEED', (SELECT owner_id FROM businesses WHERE id = ?), 'cash', 50, 8, 58, 'completed', NOW(), 1)`,
		uuid.New(), bid, bid, orderID, bid).Error; err != nil {
		t.Fatalf("seed sale: %v", err)
	}

	sale := func(id, order string) map[string]any {
		m := map[string]any{
			"id": id, "sync_version": 1,
			"receipt_number": "RCPT-" + id[:6],
			"payment_method": "cash",
			"subtotal":       "50",
			"tax_amount":     "8",
			"total":          "58",
			"sold_at":        float64(time.Now().UnixMilli()),
		}
		if order != "" {
			m["order_id"] = order
		}
		return m
	}
	dupID := uuid.New().String()
	walkID := uuid.New().String()
	res, err := svc.Push(context.Background(), bid, PushRequest{
		Changes: map[string]TableChanges{
			// Duplicate first: the walk-in after it must still apply,
			// proving the batch survived.
			"sales": {Created: []map[string]any{sale(dupID, orderID.String()), sale(walkID, "")}},
		},
	})
	if err != nil {
		t.Fatalf("push: %v", err)
	}

	foundDup := false
	for _, id := range res.Rejected["sales"] {
		if id == dupID {
			foundDup = true
		}
	}
	if !foundDup {
		t.Fatalf("expected duplicate sale %s rejected, got %+v", dupID, res.Rejected["sales"])
	}
	foundMsg := false
	for _, msg := range res.Errors["sales"] {
		if strings.Contains(msg, "duplicate sale for order") {
			foundMsg = true
		}
		if strings.Contains(msg, "duplicate key value") {
			t.Fatalf("raw postgres error leaked to client: %v", msg)
		}
	}
	if !foundMsg {
		t.Fatalf("expected duplicate-sale message, got %v", res.Errors["sales"])
	}

	applied := false
	for _, id := range res.Applied["sales"] {
		if id == walkID {
			applied = true
		}
	}
	if !applied {
		t.Fatalf("walk-in sale after the duplicate must still apply (tx poisoned?), applied=%v errors=%v", res.Applied["sales"], res.Errors["sales"])
	}
	var n int64
	if err := svc.db.WithContext(ctx).Raw(`SELECT COUNT(*) FROM sales WHERE business_id = ? AND deleted_at IS NULL`, bid).Scan(&n).Error; err != nil || n != 2 {
		t.Fatalf("expected 2 sales (seed + walk-in), got %d (err %v)", n, err)
	}
}
