package orders

import (
	"context"
	shareddb "github.com/Codecx-Org/FinAI/backend/internal/shared/db"
	apperrors "github.com/Codecx-Org/FinAI/backend/internal/shared/errors"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/pagination"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Repository struct{ db *gorm.DB }

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }
func (r *Repository) FindByIdempotency(ctx context.Context, businessID uuid.UUID, key string) (*Order, error) {
	var order Order
	err := r.db.WithContext(ctx).Scopes(shareddb.BusinessScope(businessID)).Preload("Lines").Where("idempotency_key = ?", key).First(&order).Error
	if err != nil {
		return nil, err
	}
	return &order, nil
}
func (r *Repository) Create(ctx context.Context, order *Order, lines []OrderLine) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(order).Error; err != nil {
			return err
		}
		for i := range lines {
			lines[i].OrderID = order.ID
		}
		if len(lines) > 0 {
			return tx.Create(&lines).Error
		}
		return nil
	})
}
func (r *Repository) Find(ctx context.Context, businessID, orderID uuid.UUID) (*Order, error) {
	var order Order
	err := r.db.WithContext(ctx).Scopes(shareddb.BusinessScope(businessID)).Preload("Lines").Where("id = ?", orderID).First(&order).Error
	if err != nil {
		return nil, err
	}
	return &order, nil
}
func (r *Repository) List(ctx context.Context, businessID uuid.UUID, page pagination.Page) ([]Order, error) {
	var items []Order
	err := r.db.WithContext(ctx).Scopes(shareddb.BusinessScope(businessID)).Preload("Lines").Order("created_at DESC").Limit(page.Limit).Offset(page.Offset).Find(&items).Error
	return items, err
}
func (r *Repository) Update(ctx context.Context, order *Order) error {
	return r.db.WithContext(ctx).Save(order).Error
}
func (r *Repository) SetStatus(ctx context.Context, businessID, orderID uuid.UUID, status Status) error {
	res := r.db.WithContext(ctx).Scopes(shareddb.BusinessScope(businessID)).Model(&Order{}).Where("id = ?", orderID).Update("status", status)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return apperrors.ErrNotFound.WithMessage("order not found")
	}
	return nil
}
