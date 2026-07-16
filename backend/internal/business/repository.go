package business

import (
	"context"

	apperrors "github.com/Codecx-Org/FinAI/backend/internal/shared/errors"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Repository struct{ db *gorm.DB }

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

func (r *Repository) Create(ctx context.Context, biz *Business) error {
	if biz.ID == uuid.Nil {
		biz.ID = uuid.New()
	}
	if biz.TenantID == uuid.Nil {
		biz.TenantID = biz.ID
	}
	return r.db.WithContext(ctx).Create(biz).Error
}

func (r *Repository) ListByUser(ctx context.Context, userID uuid.UUID) ([]Business, error) {
	var businesses []Business
	err := r.db.WithContext(ctx).Joins("JOIN business_members ON business_members.business_id = businesses.id").Where("business_members.user_id = ? AND business_members.is_active = true", userID).Order("businesses.created_at ASC").Find(&businesses).Error
	return businesses, err
}

func (r *Repository) FindForUser(ctx context.Context, businessID, userID uuid.UUID) (*Business, error) {
	var biz Business
	err := r.db.WithContext(ctx).Joins("JOIN business_members ON business_members.business_id = businesses.id").Where("businesses.id = ? AND business_members.user_id = ? AND business_members.is_active = true", businessID, userID).First(&biz).Error
	if err != nil {
		return nil, err
	}
	return &biz, nil
}

func (r *Repository) Update(ctx context.Context, biz *Business) error {
	return r.db.WithContext(ctx).Save(biz).Error
}

func (r *Repository) DeleteForOwner(ctx context.Context, businessID, ownerID uuid.UUID) error {
	result := r.db.WithContext(ctx).Where("id = ? AND owner_id = ?", businessID, ownerID).Delete(&Business{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return apperrors.ErrNotFound.WithMessage("business not found")
	}
	return nil
}
