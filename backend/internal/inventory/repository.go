package inventory

import (
	"context"
	shareddb "github.com/Codecx-Org/FinAI/backend/internal/shared/db"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/pagination"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type Repository struct{ db *gorm.DB }

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }
func (r *Repository) Adjust(ctx context.Context, item *InventoryItem, movement *StockMovement) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var existing InventoryItem
		err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("business_id = ? AND product_id = ?", item.BusinessID, item.ProductID).First(&existing).Error
		if err == gorm.ErrRecordNotFound {
			existing = *item
			existing.Quantity = decimal.Zero
			if err := tx.Create(&existing).Error; err != nil {
				return err
			}
		} else if err != nil {
			return err
		}
		existing.Quantity = existing.Quantity.Add(movement.QuantityDelta)
		if err := tx.Save(&existing).Error; err != nil {
			return err
		}
		return tx.Create(movement).Error
	})
}
func (r *Repository) List(ctx context.Context, businessID uuid.UUID, page pagination.Page) ([]InventoryItem, error) {
	var items []InventoryItem
	err := r.db.WithContext(ctx).Scopes(shareddb.BusinessScope(businessID)).Order("created_at DESC").Limit(page.Limit).Offset(page.Offset).Find(&items).Error
	return items, err
}
func (r *Repository) LowStock(ctx context.Context, businessID uuid.UUID) ([]InventoryItem, error) {
	var items []InventoryItem
	err := r.db.WithContext(ctx).Scopes(shareddb.BusinessScope(businessID)).Where("quantity <= low_stock_threshold").Find(&items).Error
	return items, err
}
func (r *Repository) Movements(ctx context.Context, businessID uuid.UUID, page pagination.Page) ([]StockMovement, error) {
	var items []StockMovement
	err := r.db.WithContext(ctx).Scopes(shareddb.BusinessScope(businessID)).Order("occurred_at DESC").Limit(page.Limit).Offset(page.Offset).Find(&items).Error
	return items, err
}
func (r *Repository) Valuation(ctx context.Context, businessID uuid.UUID) ([]Valuation, error) {
	var out []Valuation
	err := r.db.WithContext(ctx).Model(&InventoryItem{}).Select("product_id, quantity").Where("business_id = ?", businessID).Scan(&out).Error
	return out, err
}
