package sync

import (
	"context"
	"database/sql"
	"strings"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"

	"github.com/Codecx-Org/FinAI/backend/internal/inventory"
)

// ledger.go: stock effects of sync writes. All mutations go through
// inventory.ApplyLedger so re-pushes and REST/sync races stay idempotent.

type ledgerLineRow struct {
	ProductID *uuid.UUID `gorm:"column:product_id"`
	Quantity  string     `gorm:"column:quantity"`
}

func (s *Service) saleLedgerLines(tx *gorm.DB, businessID, saleID uuid.UUID) ([]inventory.DecrementLine, error) {
	var rows []ledgerLineRow
	if err := tx.Raw(`SELECT product_id, quantity::text FROM sale_lines WHERE sale_id = ? AND business_id = ? AND deleted_at IS NULL`, saleID, businessID).Scan(&rows).Error; err != nil {
		return nil, err
	}

	return toLedgerLines(rows), nil
}

func (s *Service) orderLedgerLines(tx *gorm.DB, businessID, orderID uuid.UUID) ([]inventory.DecrementLine, error) {
	var rows []ledgerLineRow
	if err := tx.Raw(`SELECT product_id, quantity::text FROM order_lines WHERE order_id = ? AND business_id = ? AND deleted_at IS NULL`, orderID, businessID).Scan(&rows).Error; err != nil {
		return nil, err
	}

	return toLedgerLines(rows), nil
}

func toLedgerLines(rows []ledgerLineRow) []inventory.DecrementLine {
	lines := make([]inventory.DecrementLine, 0, len(rows))

	for _, r := range rows {
		if r.ProductID == nil {
			continue
		}

		q, err := decimal.NewFromString(r.Quantity)
		if err != nil {
			continue
		}

		lines = append(lines, inventory.DecrementLine{ProductID: *r.ProductID, Quantity: q})
	}

	return lines
}

// restoreInventoryForOrder puts stock back for a cancelled/voided order. Only fires
// for an order that actually deducted (reference "order" had a negative movement).
func (s *Service) restoreInventoryForOrder(ctx context.Context, tx *gorm.DB, businessID, orderID uuid.UUID) error {
	lines, err := s.orderLedgerLines(tx, businessID, orderID)
	if err != nil || len(lines) == 0 {
		return err
	}

	return inventory.ApplyLedger(ctx, tx, businessID, "order", orderID, lines, 1, "in", "order cancelled")
}

// restoreInventoryForSale puts stock back for a voided sale. Only fires for a
// standalone sale that deducted (reference "sale" had a negative movement).
func (s *Service) restoreInventoryForSale(ctx context.Context, tx *gorm.DB, businessID, saleID uuid.UUID) error {
	lines, err := s.saleLedgerLines(tx, businessID, saleID)
	if err != nil || len(lines) == 0 {
		return err
	}

	return inventory.ApplyLedger(ctx, tx, businessID, "sale", saleID, lines, 1, "in", "sale voided")
}

// ensureSaleDeducted records the stock-out for a pushed standalone sale exactly once.
// Order-linked sales are skipped (their stock was removed at order confirm), as are
// voids/deleted sales which must never deduct.
func (s *Service) ensureSaleDeducted(ctx context.Context, tx *gorm.DB, businessID, saleID uuid.UUID) error {
	var row struct {
		OrderID sql.NullString `gorm:"column:order_id"`
		Status  string         `gorm:"column:status"`
	}

	err := tx.Raw(`SELECT order_id::text, status FROM sales WHERE id = ? AND business_id = ? AND deleted_at IS NULL`, saleID, businessID).Scan(&row).Error
	if err != nil {
		return err
	}

	if row.OrderID.Valid && row.OrderID.String != "" {
		return nil
	}

	if !strings.EqualFold(strings.TrimSpace(row.Status), "completed") {
		return nil
	}

	lines, err := s.saleLedgerLines(tx, businessID, saleID)
	if err != nil || len(lines) == 0 {
		return err
	}

	return inventory.ApplyLedger(ctx, tx, businessID, "sale", saleID, lines, -1, "out", "sale created")
}
