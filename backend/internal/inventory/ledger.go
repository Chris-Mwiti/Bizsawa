package inventory

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"

	shareddb "github.com/Codecx-Org/FinAI/backend/internal/shared/db"
)

// ApplyLedger adjusts tracked inventory for a reference event (a sale or an order)
// exactly once, using stock_movements as the source of truth so local Watermelon and
// the remote backend never double-count.
//
// sign < 0 → deduction ("out"). Only applies when no deduction already exists for the
// reference; products without a tracked inventory_items row are skipped.
//
// sign > 0 → restore ("in"). Only applies when the reference was previously deducted
// (a matching out-movement exists) and has not already been restored. This prevents
// phantom restores (e.g. cancelling a draft order that never removed stock) and
// double restores (e.g. a sale voided twice).
func ApplyLedger(db *gorm.DB, businessID uuid.UUID, refType string, refID uuid.UUID, lines []DecrementLine, sign int64, movementType, notes string) error {
	if len(lines) == 0 {
		return nil
	}

	signCond := ""
	if sign < 0 {
		signCond = "quantity_delta < 0"
	} else {
		signCond = "quantity_delta > 0"
	}

	var applied int64
	if err := db.Model(&StockMovement{}).
		Where("business_id = ? AND reference_type = ? AND reference_id = ? AND "+signCond+" AND deleted_at IS NULL",
			businessID, refType, refID).
		Count(&applied).Error; err != nil {
		return err
	}
	// Already recorded for this reference+direction (idempotent).
	if applied > 0 {
		return nil
	}

	// A restore may only bring back stock that was previously deducted for this
	// reference; otherwise cancels/voids of things that never left the shelf would
	// magically add inventory.
	if sign > 0 {
		var deducted int64
		if err := db.Model(&StockMovement{}).
			Where("business_id = ? AND reference_type = ? AND reference_id = ? AND quantity_delta < 0 AND deleted_at IS NULL",
				businessID, refType, refID).
			Count(&deducted).Error; err != nil {
			return err
		}

		if deducted == 0 {
			return nil
		}
	}

	now := time.Now().UTC()

	for _, line := range lines {
		delta := line.Quantity.Mul(decimal.NewFromInt(sign))
		// Only adjust products that have tracked stock; skip phantom creations like
		// repo.Adjust would do (mirrors the raw SQL used by sync.ensureInvoiceForOrder).
		res := db.Model(&InventoryItem{}).
			Where("business_id = ? AND product_id = ? AND deleted_at IS NULL", businessID, line.ProductID).
			Updates(map[string]any{
				"quantity":     gorm.Expr("quantity + ?", delta),
				"updated_at":   now,
				"sync_version": gorm.Expr("sync_version + 1"),
			})

		if res.Error != nil {
			return res.Error
		}

		if res.RowsAffected == 0 {
			continue
		}

		mv := &StockMovement{
			BaseModel:     shareddb.BaseModel{TenantID: businessID},
			BusinessID:    businessID,
			ProductID:     line.ProductID,
			QuantityDelta: delta,
			MovementType:  movementType,
			ReferenceType: refType,
			ReferenceID:   &refID,
			Notes:         notes,
			OccurredAt:    now,
		}

		if err := db.Create(mv).Error; err != nil {
			return err
		}
	}

	return nil
}
