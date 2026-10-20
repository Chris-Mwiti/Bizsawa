package sync

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
)

// A product's stock row created offline and a sale of it, pushed in one batch:
// the client sends the row with the sale already applied (10 - 2 = 8) plus the
// sale's ledger row. The ledger row must be recorded, not applied a second time.
func TestPgPushNewStockRowWithSameBatchSaleIsNotDoubleDeducted(t *testing.T) {
	svc, bid, pid := pgSyncSetup(t)
	ctx := context.Background()

	var owner string
	if err := svc.db.WithContext(ctx).Raw(`SELECT owner_id::text FROM businesses WHERE id = ?`, bid).Scan(&owner).Error; err != nil {
		t.Fatalf("owner: %v", err)
	}
	saleID := uuid.New().String()
	movementID := uuid.New().String()
	res, err := svc.Push(ctx, bid, PushRequest{Changes: map[string]TableChanges{
		"inventory_items": {Created: []map[string]any{{"id": uuid.New().String(), "product_id": pid.String(), "quantity": "8", "sync_version": 1}}},
		"stock_movements": {Created: []map[string]any{{
			"id": movementID, "product_id": pid.String(), "quantity_delta": "-2", "movement_type": "out",
			"reference_type": "sale", "reference_id": saleID, "occurred_at": float64(time.Now().UnixMilli()), "sync_version": 1,
		}}},
		"sales": {Created: []map[string]any{{
			"id": saleID, "receipt_number": "R-1", "staff_id": owner, "payment_method": "cash",
			"subtotal": "200", "tax_amount": "0", "total": "200", "status": "completed",
			"sold_at": float64(time.Now().UnixMilli()), "sync_version": 1,
		}}},
		"sale_lines": {Created: []map[string]any{{
			"id": uuid.New().String(), "sale_id": saleID, "product_id": pid.String(),
			"quantity": "2", "unit_price": "100", "line_total": "200", "sync_version": 1,
		}}},
	}})
	if err != nil {
		t.Fatalf("push: %v", err)
	}
	if len(res.Rejected) > 0 {
		t.Fatalf("unexpected rejections: %v %v", res.Rejected, res.Errors)
	}

	var qty float64
	if err := svc.db.WithContext(ctx).Raw(`SELECT quantity FROM inventory_items WHERE business_id = ? AND product_id = ?`, bid, pid).Scan(&qty).Error; err != nil {
		t.Fatalf("qty: %v", err)
	}
	if qty != 8 {
		t.Fatalf("quantity = %v, want 8 (pushed row already had the sale applied)", qty)
	}
	var recorded int64
	svc.db.WithContext(ctx).Raw(`SELECT COUNT(*) FROM stock_movements WHERE id = ?`, movementID).Scan(&recorded)
	if recorded != 1 {
		t.Fatalf("ledger row not recorded (count %d): the sale would be deducted again by ensureSaleDeducted", recorded)
	}
}

// The pushing device's clock must never decide created_at/updated_at: an
// offline sale stamped hours ago would sort before other devices' pull
// cursors and never reach them.
func TestPgPushIgnoresClientTimestamps(t *testing.T) {
	svc, bid, _ := pgSyncSetup(t)
	ctx := context.Background()

	stale := float64(time.Now().Add(-6 * time.Hour).UnixMilli())
	id := uuid.New()
	before := time.Now().Add(-time.Minute)
	res, err := svc.Push(ctx, bid, PushRequest{Changes: map[string]TableChanges{
		"customers": {Created: []map[string]any{{
			"id": id.String(), "name": "Offline", "sync_version": 1, "created_at": stale, "updated_at": stale,
		}}},
	}})
	if err != nil || len(res.Rejected) > 0 {
		t.Fatalf("push: %v %v", err, res.Errors)
	}

	var created, updated time.Time
	row := svc.db.WithContext(ctx).Raw(`SELECT created_at, updated_at FROM customers WHERE id = ?`, id).Row()
	if err := row.Scan(&created, &updated); err != nil {
		t.Fatalf("scan: %v", err)
	}
	if updated.Before(before) || created.Before(before) {
		t.Fatalf("server kept the client's clock: created_at=%v updated_at=%v (pushed %v)", created, updated, time.UnixMilli(int64(stale)))
	}

	// An update carrying a stale updated_at must not move the row backwards either.
	res, err = svc.Push(ctx, bid, PushRequest{Changes: map[string]TableChanges{
		"customers": {Updated: []map[string]any{{"id": id.String(), "name": "Edited", "sync_version": 1, "updated_at": stale, "created_at": stale}}},
	}})
	if err != nil || len(res.Applied["customers"]) != 1 {
		t.Fatalf("update: %v %+v", err, res)
	}
	row = svc.db.WithContext(ctx).Raw(`SELECT created_at, updated_at FROM customers WHERE id = ?`, id).Row()
	var created2, updated2 time.Time
	if err := row.Scan(&created2, &updated2); err != nil {
		t.Fatalf("scan: %v", err)
	}
	if !created2.Equal(created) || updated2.Before(updated) {
		t.Fatalf("update rewrote server timestamps: created %v→%v updated %v→%v", created, created2, updated, updated2)
	}
}
