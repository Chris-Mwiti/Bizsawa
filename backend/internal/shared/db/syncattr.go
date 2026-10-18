package db

import (
	"context"
	"regexp"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/Codecx-Org/FinAI/backend/internal/shared/middleware"
)

// Writer attribution for REST mutation paths. Sync-push writes record their
// writer inside the sync service; every other write to a syncable table must
// go through these helpers so version counters move and the last-writer
// device stays accurate. Without this, REST writes are invisible to the
// version protocol: a later push can silently steamroll them with no
// conflict and no trace.
//
// Table names are allowlisted — never interpolate caller input into SQL.

var syncableTablePattern = regexp.MustCompile(`^[a-z_]+$`)

var syncableTables = map[string]bool{
	"products": true, "product_variants": true, "customers": true,
	"inventory_items": true, "stock_movements": true, "orders": true,
	"order_lines": true, "sales": true, "sale_lines": true,
	"expenses": true, "invoices": true, "invoice_lines": true,
	"payment_commands": true, "tax_rules": true,
}

func validSyncTable(table string) bool {
	return syncableTables[table] && syncableTablePattern.MatchString(table)
}

// TouchCreated records the writing device for a fresh record. Versions
// start at 1 from the model default — never bumped here.
func TouchCreated(db *gorm.DB, ctx context.Context, businessID uuid.UUID, table string, recordID uuid.UUID) {
	device, ok := middleware.DeviceIDFromCtx(ctx)
	if !ok || !validSyncTable(table) {
		return
	}
	db.Exec(`INSERT INTO record_writers (business_id, table_name, record_id, device_id, updated_at) VALUES (?, ?, ?, ?, NOW()) ON CONFLICT (business_id, table_name, record_id) DO UPDATE SET device_id = EXCLUDED.device_id, updated_at = NOW()`, businessID, table, recordID, device)
}

// TouchUpdated bumps the version counter and records the writing device.
// Call after every REST update/void/restore so offline edits racing it hit
// the version protocol (conflict or same-device LWW) instead of overwriting
// silently.
func TouchUpdated(db *gorm.DB, ctx context.Context, businessID uuid.UUID, table string, recordID uuid.UUID) {
	if !validSyncTable(table) {
		return
	}
	db.Exec(`UPDATE `+table+` SET sync_version = sync_version + 1, updated_at = NOW() WHERE id = ? AND business_id = ?`, recordID, businessID)
	device, ok := middleware.DeviceIDFromCtx(ctx)
	if !ok {
		return
	}
	db.Exec(`INSERT INTO record_writers (business_id, table_name, record_id, device_id, updated_at) VALUES (?, ?, ?, ?, NOW()) ON CONFLICT (business_id, table_name, record_id) DO UPDATE SET device_id = EXCLUDED.device_id, updated_at = NOW()`, businessID, table, recordID, device)
}

// ForgetRecord drops writer attribution for a deleted record so the side
// table cannot grow unboundedly with orphan rows.
func ForgetRecord(db *gorm.DB, businessID uuid.UUID, table string, recordID uuid.UUID) {
	if !validSyncTable(table) {
		return
	}
	db.Exec(`DELETE FROM record_writers WHERE business_id = ? AND table_name = ? AND record_id = ?`, businessID, table, recordID)
}
