package tenancy

import (
	"log/slog"
	"context"
	"time"

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

func (r *Repository) CreateSubscriptionPayment(ctx context.Context, p *SubscriptionPayment) error {
	return r.db.WithContext(ctx).Create(p).Error
}

func (r *Repository) FindSubscriptionPaymentByID(ctx context.Context, id uuid.UUID) (*SubscriptionPayment, error) {
	var p SubscriptionPayment
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&p).Error
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *Repository) FindSubscriptionPaymentByCheckout(ctx context.Context, checkout string) (*SubscriptionPayment, error) {
	var p SubscriptionPayment
	err := r.db.WithContext(ctx).Where("checkout_request_id = ?", checkout).First(&p).Error
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *Repository) FindSubscriptionPaymentByIdempotency(ctx context.Context, key string) (*SubscriptionPayment, error) {
	var p SubscriptionPayment
	err := r.db.WithContext(ctx).Where("idempotency_key = ?", key).First(&p).Error
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *Repository) UpdateSubscriptionPayment(ctx context.Context, p *SubscriptionPayment) error {
	return r.db.WithContext(ctx).Save(p).Error
}

func (r *Repository) UpsertActiveSubscription(ctx context.Context, userID uuid.UUID, plan PlanCode, endsAt *time.Time) (*Subscription, error) {
	// Deactivate previous active, create new active
	var active Subscription
	err := r.db.WithContext(ctx).Where("user_id = ? AND status = 'ACTIVE'", userID).First(&active).Error
	if err == nil {
		if err := r.db.WithContext(ctx).Model(&active).Update("status", "INACTIVE").Error; err != nil {
			slog.ErrorContext(ctx, "database operation failed", "err", err)
			return nil, err
		}
	}
	sub := &Subscription{UserID: userID, PlanCode: plan, Status: "ACTIVE", EndsAt: endsAt}
	if err := r.db.WithContext(ctx).Create(sub).Error; err != nil {
		return nil, err
	}
	return sub, nil
}