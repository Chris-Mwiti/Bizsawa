package inventory

import (
	"context"
	shareddb "github.com/Codecx-Org/FinAI/backend/internal/shared/db"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/pagination"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"time"
)

type Service struct{ repo *Repository }

func NewService(repo *Repository) *Service { return &Service{repo: repo} }

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
	for _, line := range lines {
		ref := orderID
		mv := &StockMovement{BaseModel: shareddb.BaseModel{TenantID: businessID}, BusinessID: businessID, ProductID: line.ProductID, QuantityDelta: line.Quantity.Neg(), MovementType: "sale", ReferenceType: "order", ReferenceID: &ref, OccurredAt: time.Now().UTC()}
		item := &InventoryItem{BaseModel: shareddb.BaseModel{TenantID: businessID}, BusinessID: businessID, ProductID: line.ProductID}
		if err := s.repo.Adjust(ctx, item, mv); err != nil {
			return err
		}
	}
	return nil
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
