package expenses

import (
	"context"
	shareddb "github.com/Codecx-Org/FinAI/backend/internal/shared/db"
	apperrors "github.com/Codecx-Org/FinAI/backend/internal/shared/errors"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/pagination"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"time"
)

type Repository struct{ db *gorm.DB }

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }
func (r *Repository) Create(ctx context.Context, item *Expense) error {
	return r.db.WithContext(ctx).Create(item).Error
}
func (r *Repository) List(ctx context.Context, businessID uuid.UUID, page pagination.Page) ([]Expense, error) {
	var items []Expense
	err := r.db.WithContext(ctx).Scopes(shareddb.BusinessScope(businessID)).Order("spent_at DESC").Limit(page.Limit).Offset(page.Offset).Find(&items).Error
	return items, err
}
func (r *Repository) Find(ctx context.Context, businessID, id uuid.UUID) (*Expense, error) {
	var item Expense
	err := r.db.WithContext(ctx).Scopes(shareddb.BusinessScope(businessID)).Where("id = ?", id).First(&item).Error
	if err != nil {
		return nil, err
	}
	return &item, nil
}
func (r *Repository) Delete(ctx context.Context, businessID, id uuid.UUID) error {
	res := r.db.WithContext(ctx).Scopes(shareddb.BusinessScope(businessID)).Where("id = ?", id).Delete(&Expense{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return apperrors.ErrNotFound.WithMessage("expense not found")
	}
	return nil
}
func (r *Repository) Summary(ctx context.Context, businessID uuid.UUID, from, to time.Time) ([]CategorySummary, error) {
	var out []CategorySummary
	err := r.db.WithContext(ctx).Model(&Expense{}).Select("category, COALESCE(SUM(amount),0) AS amount, COALESCE(SUM(tax_amount),0) AS tax_amount, COUNT(*) AS count").Where("business_id = ? AND spent_at >= ? AND spent_at < ?", businessID, from, to).Group("category").Scan(&out).Error
	return out, err
}
