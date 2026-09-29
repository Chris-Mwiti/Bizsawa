package inventory

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"

	shareddb "github.com/Codecx-Org/FinAI/backend/internal/shared/db"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/pagination"
)

type Service struct{ repo *Repository }

func NewService(repo *Repository) *Service { return &Service{repo: repo} }

func (s *Service) WithTx(tx *gorm.DB) *Service {
	if tx == nil {
		return s
	}

	return &Service{
		repo: s.repo.WithTx(tx),
	}
}

type AdjustmentRequest struct {
	ProductID         uuid.UUID       `json:"productId"`
	QuantityDelta     decimal.Decimal `json:"quantityDelta"`
	LowStockThreshold decimal.Decimal `json:"lowStockThreshold"`
	Notes             string          `json:"notes"`
}
type DecrementLine struct {
	ProductID uuid.UUID
	Quantity  decimal.Decimal
}

func (s *Service) Adjust(ctx context.Context, businessID uuid.UUID, req AdjustmentRequest) (*StockMovement, error) {
	mv := &StockMovement{BaseModel: shareddb.BaseModel{TenantID: businessID}, BusinessID: businessID, ProductID: req.ProductID, QuantityDelta: req.QuantityDelta, MovementType: "adjustment", Notes: req.Notes, OccurredAt: time.Now().UTC()}
	item := &InventoryItem{BaseModel: shareddb.BaseModel{TenantID: businessID}, BusinessID: businessID, ProductID: req.ProductID, LowStockThreshold: req.LowStockThreshold}

	return mv, s.repo.Adjust(ctx, item, mv)
}

func (s *Service) DecrementForOrder(ctx context.Context, businessID, orderID uuid.UUID, lines []DecrementLine) error {
	// Ledger-guarded (reference "order"): runs at most once per order even if the
	// REST confirm and the offline sync-confirm path both fire.
	return ApplyLedger(s.repo.db.WithContext(ctx), businessID, "order", orderID, lines, -1, "sale", "order confirmed")
}

// DeductForSale records the stock-out for a standalone (walk-in) sale. Ledger-guarded
// so a sale pushed through sync and one created over REST never deducts twice.
func (s *Service) DeductForSale(ctx context.Context, businessID, saleID uuid.UUID, lines []DecrementLine) error {
	return ApplyLedger(s.repo.db.WithContext(ctx), businessID, "sale", saleID, lines, -1, "out", "sale created")
}

// RestoreForSale returns stock for a voided sale. Only fires if the sale previously
// deducted stock (reference "sale") and has not been restored already.
func (s *Service) RestoreForSale(ctx context.Context, businessID, saleID uuid.UUID, lines []DecrementLine) error {
	return ApplyLedger(s.repo.db.WithContext(ctx), businessID, "sale", saleID, lines, 1, "in", "sale voided")
}

// RestoreForOrder returns stock for a cancelled order. Only fires if the order
// previously deducted stock (reference "order") and has not been restored already.
func (s *Service) RestoreForOrder(ctx context.Context, businessID, orderID uuid.UUID, lines []DecrementLine) error {
	return ApplyLedger(s.repo.db.WithContext(ctx), businessID, "order", orderID, lines, 1, "in", "order cancelled")
}

func (s *Service) List(ctx context.Context, businessID uuid.UUID, page pagination.Page) ([]InventoryItem, error) {
	return s.repo.List(ctx, businessID, page)
}

func (s *Service) GetLowStockItems(ctx context.Context, businessID uuid.UUID) ([]InventoryItem, error) {
	return s.repo.LowStock(ctx, businessID)
}

func (s *Service) GetStockMovements(ctx context.Context, businessID uuid.UUID, page pagination.Page) ([]StockMovement, error) {
	return s.repo.Movements(ctx, businessID, page)
}

func (s *Service) GetInventoryValuation(ctx context.Context, businessID uuid.UUID) ([]Valuation, error) {
	return s.repo.Valuation(ctx, businessID)
}
