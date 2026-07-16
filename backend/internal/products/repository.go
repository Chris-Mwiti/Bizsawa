package products

import (
	"context"
	"strings"

	shareddb "github.com/Codecx-Org/FinAI/backend/internal/shared/db"
	apperrors "github.com/Codecx-Org/FinAI/backend/internal/shared/errors"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/pagination"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Repository struct{ db *gorm.DB }

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

func (r *Repository) Create(ctx context.Context, product *Product) error {
	err := r.db.WithContext(ctx).Create(product).Error
	return translateConflict(err)
}

func (r *Repository) List(ctx context.Context, businessID uuid.UUID, page pagination.Page) ([]Product, error) {
	var products []Product
	err := r.db.WithContext(ctx).Scopes(shareddb.BusinessScope(businessID)).Preload("Variants").Order("created_at DESC").Limit(page.Limit).Offset(page.Offset).Find(&products).Error
	return products, err
}

func (r *Repository) FindProductVariant(ctx context.Context, businessID uuid.UUID, prodVarId uuid.UUID) (*ProductVariant, error) {
	var productVariant *ProductVariant

	err := r.db.WithContext(ctx).Scopes(shareddb.BusinessScope(businessID)).Where("id = ?", prodVarId).First(&productVariant).Error

	return productVariant, err
}

func (r *Repository) Find(ctx context.Context, businessID, productID uuid.UUID) (*Product, error) {
	var product Product
	err := r.db.WithContext(ctx).Scopes(shareddb.BusinessScope(businessID)).Preload("Variants").Where("id = ?", productID).First(&product).Error
	if err != nil {
		return nil, err
	}
	return &product, nil
}

func (r *Repository) Update(ctx context.Context, product *Product) error {
	err := r.db.WithContext(ctx).Save(product).Error
	return translateConflict(err)
}

func (r *Repository) ReplaceVariants(ctx context.Context, product *Product, variants []ProductVariant) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("business_id = ? AND product_id = ?", product.BusinessID, product.ID).Delete(&ProductVariant{}).Error; err != nil {
			return err
		}
		if len(variants) > 0 {
			if err := tx.Create(&variants).Error; err != nil {
				return translateConflict(err)
			}
		}
		return nil
	})
}

func (r *Repository) Delete(ctx context.Context, businessID, productID uuid.UUID) error {
	result := r.db.WithContext(ctx).Scopes(shareddb.BusinessScope(businessID)).Where("id = ?", productID).Delete(&Product{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return apperrors.ErrNotFound.WithMessage("product not found")
	}
	return nil
}

func translateConflict(err error) error {
	if err == nil {
		return nil
	}
	message := strings.ToLower(err.Error())
	if strings.Contains(message, "duplicate") || strings.Contains(message, "unique") {
		return apperrors.ErrConflict.WithMessage("sku already exists for this business")
	}
	return err
}
