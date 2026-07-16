package tenancy

import (
	"context"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Repository struct{ db *gorm.DB }

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

func (r *Repository) ActiveByUser(ctx context.Context, userID uuid.UUID) (*Subscription, error) {
	var sub Subscription
	err := r.db.WithContext(ctx).Where("user_id = ? AND status = 'ACTIVE'", userID).First(&sub).Error
	if err != nil {
		return nil, err
	}
	return &sub, nil
}

func (r *Repository) Create(ctx context.Context, sub *Subscription) error {
	return r.db.WithContext(ctx).Create(sub).Error
}

func (r *Repository) CountBusinessesByOwner(ctx context.Context, userID uuid.UUID) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).Table("businesses").Where("owner_id = ?", userID).Count(&count).Error
	return count, err
}
