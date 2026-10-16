package products

import (
	"context"
	"strings"

	"github.com/google/uuid"
	"gorm.io/gorm"

	shareddb "github.com/Codecx-Org/FinAI/backend/internal/shared/db"
	apperrors "github.com/Codecx-Org/FinAI/backend/internal/shared/errors"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/pagination"
)

type Repository struct{ db *gorm.DB }

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

func (r *Repository) WithTx(tx *gorm.DB) *Repository {
	if tx == nil {
		return r
	}

	return &Repository{
		db: tx,
	}
}

func (r *Repository) Create(ctx context.Context, product *Product) error {
	if err := r.db.WithContext(ctx).Create(product).Error; err != nil {
		return translateConflict(err)
	}
	shareddb.TouchCreated(r.db, ctx, product.BusinessID, "products", product.ID)
	return nil
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
	if err := r.db.WithContext(ctx).Save(product).Error; err != nil {
		return translateConflict(err)
	}
	shareddb.TouchUpdated(r.db, ctx, product.BusinessID, "products", product.ID)
	return nil
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
			for i := range variants {
				shareddb.TouchCreated(tx, ctx, product.BusinessID, "product_variants", variants[i].ID)
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

	shareddb.ForgetRecord(r.db, businessID, "products", productID)
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
