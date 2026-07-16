package users

import (
	"context"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Repository struct{ db *gorm.DB }

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

func (r *Repository) CreateMember(ctx context.Context, member *BusinessMember) error {
	return r.db.WithContext(ctx).Create(member).Error
}

func (r *Repository) FindActiveByBusinessAndUser(ctx context.Context, businessID, userID uuid.UUID) (*BusinessMember, error) {
	var member BusinessMember
	err := r.db.WithContext(ctx).Where("business_id = ? AND user_id = ? AND is_active = true", businessID, userID).First(&member).Error
	if err != nil {
		return nil, err
	}
	return &member, nil
}

func (r *Repository) ListByBusiness(ctx context.Context, businessID uuid.UUID) ([]BusinessMember, error) {
	var members []BusinessMember
	err := r.db.WithContext(ctx).Where("business_id = ?", businessID).Order("created_at ASC").Find(&members).Error
	return members, err
}

func (r *Repository) UpdateRole(ctx context.Context, businessID, memberID uuid.UUID, role string) error {
	return r.db.WithContext(ctx).Model(&BusinessMember{}).Where("business_id = ? AND id = ?", businessID, memberID).Update("role", role).Error
}

func (r *Repository) Deactivate(ctx context.Context, businessID, memberID uuid.UUID) error {
	return r.db.WithContext(ctx).Model(&BusinessMember{}).Where("business_id = ? AND id = ?", businessID, memberID).Update("is_active", false).Error
}

func (r *Repository) FindProfileByUserID(ctx context.Context, userID uuid.UUID) (*UserProfile, error) {
	var profile UserProfile
	err := r.db.WithContext(ctx).Where("user_id = ?", userID).First(&profile).Error
	if err != nil {
		return nil, err
	}
	return &profile, nil
}

func (r *Repository) CreateProfile(ctx context.Context, profile *UserProfile) error {
	return r.db.WithContext(ctx).Create(profile).Error
}

func (r *Repository) UpdateProfile(ctx context.Context, profile *UserProfile) error {
	return r.db.WithContext(ctx).Save(profile).Error
}
