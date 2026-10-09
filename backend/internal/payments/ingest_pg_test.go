package payments

// PostgreSQL-backed ingest tests: idempotency, receipt races, tenant
// isolation and outbox atomicity. These need a live database, so they skip
// unless TEST_DATABASE_URL is set:
//
//   TEST_DATABASE_URL='postgres://user:pass@localhost:5432/db?sslmode=disable' \
//     go test ./internal/payments/ -run 'TestPgIngest|TestPgTenant' -v
//
// CI without Postgres runs the pure unit tests (capture_test.go,
// ingest_test.go) instead. Migrations are applied from ../../migrations.

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverdatabasesql"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/riverqueue/river/rivermigrate"
	"github.com/jackc/pgx/v5/pgxpool"
	gormpg "gorm.io/driver/postgres"
	"gorm.io/gorm"

	_ "github.com/jackc/pgx/v5/stdlib"

	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	gomigrate "github.com/golang-migrate/migrate/v4"

	"github.com/Codecx-Org/FinAI/backend/internal/shared/pagination"
)

func pgTestSetup(t *testing.T) (*Service, uuid.UUID, uuid.UUID) {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL unset — skipping Postgres ingest tests")
	}
	ctx := context.Background()

	sqlDB, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { sqlDB.Close() })

	// App migrations (000001..) then River tables.
	migrationsPath, _ := filepath.Abs("../../migrations")
	m, err := gomigrate.New("file://"+migrationsPath, dsn)
	if err != nil {
		t.Fatalf("migrate new: %v", err)
	}
	if err := m.Up(); err != nil && err.Error() != "no change" {
		t.Fatalf("migrate up: %v", err)
	}
	m.Close()

	poolCfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatalf("pgx config: %v", err)
	}
	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		t.Fatalf("pgx pool: %v", err)
	}
	t.Cleanup(pool.Close)
	rm, err := rivermigrate.New(riverpgxv5.New(pool), nil)
	if err != nil {
		t.Fatalf("river migrator: %v", err)
	}
	if _, err := rm.Migrate(ctx, rivermigrate.DirectionUp, nil); err != nil {
		t.Fatalf("river migrate: %v", err)
	}

	gdb, err := gorm.Open(gormpg.New(gormpg.Config{Conn: sqlDB}), &gorm.Config{})
	if err != nil {
		t.Fatalf("gorm open: %v", err)
	}
	ingester, err := river.NewClient(riverdatabasesql.New(sqlDB), &river.Config{})
	if err != nil {
		t.Fatalf("river client: %v", err)
	}

	svc := NewService(NewRepository(gdb), ingester, slog.Default(), nil)

	// Fresh business + owner per test run (unique slug).
	bizID := uuid.New()
	ownerID := uuid.New()
	if err := gdb.Exec(`INSERT INTO auth_users (id, email, password_hash) VALUES (?, ?, 'x')`,
		ownerID, fmt.Sprintf("cap-%s@test.dev", bizID.String()[:8])).Error; err != nil {
		t.Fatalf("owner: %v", err)
	}
	if err := gdb.Exec(`INSERT INTO businesses (id, tenant_id, owner_id, name, slug) VALUES (?, ?, ?, 'cap', ?)`,
		bizID, bizID, ownerID, "cap-"+bizID.String()[:8]).Error; err != nil {
		t.Fatalf("business: %v", err)
	}
	return svc, bizID, ownerID
}

func pgItem(receipt string, amount int64) IngestItem {
	hash := "abcdef0123456789abcdef0123456789"
	return IngestItem{
		ClientEventID: uuid.New(),
		MpesaReceipt:  &receipt,
		AmountMinor:   amount,
		Currency:      "KES",
		OccurredAt:    time.Now().UTC().Add(-time.Minute),
		ChannelType:   string(ChannelTill),
		Source:        string(SourceSMSDevice),
		PayerHash:     &hash,
	}
}

func TestPgIngestBatchTwiceIsIdempotent(t *testing.T) {
	svc, biz, _ := pgTestSetup(t)
	ctx := context.Background()

	batch := []IngestItem{pgItem("PGDUP00001", 50000), pgItem("PGDUP00002", 75000)}
	first := svc.Ingest(ctx, biz, batch)
	for _, r := range first {
		if r.Result != "created" {
			t.Fatalf("first pass %v = %v (%v)", r.ClientEventID, r.Result, r.Reason)
		}
	}
	second := svc.Ingest(ctx, biz, batch)
	for _, r := range second {
		if r.Result != "duplicate" {
			t.Fatalf("second pass %v = %v, want duplicate", r.ClientEventID, r.Result)
		}
	}
	var count int64
	if err := svc.repo.db.Model(&CapturedPayment{}).
		Where("business_id = ?", biz).Count(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != 2 {
		t.Fatalf("rows = %d, want 2", count)
	}
}

func TestPgIngestReceiptRace(t *testing.T) {
	svc, biz, _ := pgTestSetup(t)
	ctx := context.Background()

	// Two workers, same receipt, different events and amounts: exactly one
	// logical create path may win cleanly; the loser must report
	// duplicate/merged/disputed — never rejected/internal.
	const workers = 8
	results := make([]ItemResult, workers)
	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			amount := int64(50000)
			if i%2 == 1 {
				amount = 50001
			}
			out := svc.Ingest(ctx, biz, []IngestItem{pgItem("PGRACE0001", amount)})
			results[i] = out[0]
		}(i)
	}
	wg.Wait()
	allowed := map[string]bool{"created": true, "duplicate": true, "merged": true, "disputed": true}
	for i, r := range results {
		if !allowed[r.Result] {
			t.Fatalf("worker %d result = %v (%v)", i, r.Result, r.Reason)
		}
	}
}

func TestPgTenantIsolation(t *testing.T) {
	svc, bizA, _ := pgTestSetup(t)
	ctx := context.Background()

	bizB := uuid.New()
	ownerB := uuid.New()
	if err := svc.repo.db.Exec(`INSERT INTO auth_users (id, email, password_hash) VALUES (?, ?, 'x')`,
		ownerB, fmt.Sprintf("capb-%s@test.dev", bizB.String()[:8])).Error; err != nil {
		t.Fatal(err)
	}
	if err := svc.repo.db.Exec(`INSERT INTO businesses (id, tenant_id, owner_id, name, slug) VALUES (?, ?, ?, 'capb', ?)`,
		bizB, bizB, ownerB, "capb-"+bizB.String()[:8]).Error; err != nil {
		t.Fatal(err)
	}

	// Same receipt code in two businesses: both accepted (uniqueness is per business).
	if got := svc.Ingest(ctx, bizA, []IngestItem{pgItem("PGBIZSHARE1", 10000)})[0]; got.Result != "created" {
		t.Fatalf("bizA = %v", got.Result)
	}
	if got := svc.Ingest(ctx, bizB, []IngestItem{pgItem("PGBIZSHARE1", 10000)})[0]; got.Result != "created" {
		t.Fatalf("bizB = %v", got.Result)
	}
	// Listing is scoped: A sees only A's row, B only B's.
	for _, tc := range []uuid.UUID{bizA, bizB} {
		items, err := svc.ListCaptured(ctx, tc, CaptureFilter{Page: pagination.Page{Limit: 25}})
		if err != nil {
			t.Fatal(err)
		}
		if len(items) != 1 {
			t.Fatalf("biz %v listed %d, want 1", tc, len(items))
		}
		if items[0].BusinessID != tc {
			t.Fatalf("biz %v leaked foreign row", tc)
		}
	}
}

func TestPgOutboxEmittedWithRow(t *testing.T) {
	svc, biz, _ := pgTestSetup(t)
	ctx := context.Background()

	out := svc.Ingest(ctx, biz, []IngestItem{pgItem("PGOUTBOX001", 20000)})
	if out[0].Result != "created" {
		t.Fatalf("result = %v", out[0].Result)
	}
	var jobs int64
	if err := svc.repo.db.Table("river_job").Where("kind = ?", "payment.event").Count(&jobs).Error; err != nil {
		t.Fatalf("river_job count: %v", err)
	}
	if jobs < 1 {
		t.Fatalf("no payment.event outbox job for created capture")
	}
	// Rejected items emit nothing.
	bad := pgItem("x", 0)
	if got := svc.Ingest(ctx, biz, []IngestItem{bad})[0]; got.Result != "rejected" {
		t.Fatalf("bad item = %v, want rejected", got.Result)
	}
}

func TestPgDevices(t *testing.T) {
	svc, biz, _ := pgTestSetup(t)
	ctx := context.Background()

	d, err := svc.RegisterDevice(ctx, biz, RegisterDeviceRequest{AppVersion: "1.2.0", ParserVersion: "1"})
	if err != nil || d.ID == uuid.Nil {
		t.Fatalf("register device: %v", d)
	}
	it := pgItem("PGDEV00001", 30000)
	it.DeviceID = &d.ID
	if got := svc.Ingest(ctx, biz, []IngestItem{it})[0]; got.Result != "created" {
		t.Fatalf("known device = %v", got.Result)
	}
	unknown := uuid.New()
	it2 := pgItem("PGDEV00002", 30000)
	it2.DeviceID = &unknown
	if got := svc.Ingest(ctx, biz, []IngestItem{it2})[0]; got.Result != "rejected" {
		t.Fatalf("unknown device = %v, want rejected", got.Result)
	}
}

func TestPgQuarantineScope(t *testing.T) {
	svc, biz, _ := pgTestSetup(t)
	ctx := context.Background()

	svc.Ingest(ctx, biz, []IngestItem{pgItem("PGQ0000001", 10000)})
	// Verified-only scope must exclude the fresh device_reported row.
	var verified, total int64
	m := svc.repo.db.Model(&CapturedPayment{}).Where("business_id = ?", biz)
	if err := m.Scopes(VerifiedScope()).Count(&verified).Error; err != nil {
		t.Fatal(err)
	}
	if err := svc.repo.db.Model(&CapturedPayment{}).Where("business_id = ?", biz).Count(&total).Error; err != nil {
		t.Fatal(err)
	}
	if total != 1 || verified != 0 {
		t.Fatalf("total = %d verified = %d, want 1/0", total, verified)
	}
}
