package customers

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

func (r *Repository) Create(ctx context.Context, customer *Customer) error {
	return r.db.WithContext(ctx).Create(customer).Error
}

func (r *Repository) List(ctx context.Context, businessID uuid.UUID, page pagination.Page) ([]Customer, error) {
	var customers []Customer
	err := r.db.WithContext(ctx).Scopes(shareddb.BusinessScope(businessID)).Order("created_at DESC").Limit(page.Limit).Offset(page.Offset).Find(&customers).Error
	return customers, err
}

func (r *Repository) Find(ctx context.Context, businessID, customerID uuid.UUID) (*Customer, error) {
	var customer Customer
	err := r.db.WithContext(ctx).Scopes(shareddb.BusinessScope(businessID)).Where("id = ?", customerID).First(&customer).Error
	if err != nil {
		return nil, err
	}
	return &customer, nil
}

func (r *Repository) Update(ctx context.Context, customer *Customer) error {
	return r.db.WithContext(ctx).Save(customer).Error
}

func (r *Repository) Delete(ctx context.Context, businessID, customerID uuid.UUID) error {
	result := r.db.WithContext(ctx).Scopes(shareddb.BusinessScope(businessID)).Where("id = ?", customerID).Delete(&Customer{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return apperrors.ErrNotFound.WithMessage("customer not found")
	}
	return nil
}

func (r *Repository) TopCustomers(ctx context.Context, businessID uuid.UUID, limit int) ([]Customer, error) {
	var customers []Customer
	err := r.db.WithContext(ctx).Scopes(shareddb.BusinessScope(businessID)).Order("total_spend DESC, last_purchase_at DESC NULLS LAST").Limit(limit).Find(&customers).Error
	return customers, err
}
