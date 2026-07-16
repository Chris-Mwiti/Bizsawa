package payments

import (
	"context"
	"time"

	shareddb "github.com/Codecx-Org/FinAI/backend/internal/shared/db"
	apperrors "github.com/Codecx-Org/FinAI/backend/internal/shared/errors"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/pagination"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type Repository struct{ db *gorm.DB }

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

func (r *Repository) FindByIdempotency(ctx context.Context, businessID uuid.UUID, key string) (*PaymentCommand, error) {
	var cmd PaymentCommand
	err := r.db.WithContext(ctx).Scopes(shareddb.BusinessScope(businessID)).Where("idempotency_key = ?", key).First(&cmd).Error
	if err != nil {
		return nil, err
	}
	return &cmd, nil
}

func (r *Repository) Create(ctx context.Context, cmd *PaymentCommand) error {
	return r.db.WithContext(ctx).Create(cmd).Error
}

func (r *Repository) Find(ctx context.Context, businessID, id uuid.UUID) (*PaymentCommand, error) {
	var cmd PaymentCommand
	err := r.db.WithContext(ctx).Scopes(shareddb.BusinessScope(businessID)).Where("id = ?", id).First(&cmd).Error
	if err != nil {
		return nil, err
	}
	return &cmd, nil
}

func (r *Repository) List(ctx context.Context, businessID uuid.UUID, page pagination.Page) ([]PaymentCommand, error) {
	var items []PaymentCommand
	err := r.db.WithContext(ctx).Scopes(shareddb.BusinessScope(businessID)).Order("created_at DESC").Limit(page.Limit).Offset(page.Offset).Find(&items).Error
	return items, err
}

func (r *Repository) ClaimPending(ctx context.Context, limit int) ([]PaymentCommand, error) {
	if limit <= 0 {
		limit = 25
	}
	var items []PaymentCommand
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE", Options: "SKIP LOCKED"}).Where("status = ?", StatusPending).Order("created_at ASC").Limit(limit).Find(&items).Error; err != nil {
			return err
		}
		for _, item := range items {
			if err := tx.Model(&PaymentCommand{}).Where("id = ?", item.ID).Update("status", StatusProcessing).Error; err != nil {
				return err
			}
		}
		return nil
	})
	return items, err
}

func (r *Repository) MarkSucceeded(ctx context.Context, id uuid.UUID, requestID, receipt string, raw []byte) error {
	now := time.Now().UTC()
	return r.db.WithContext(ctx).Model(&PaymentCommand{}).Where("id = ?", id).Updates(map[string]any{"status": StatusSucceeded, "provider_request_id": requestID, "provider_receipt": receipt, "result_payload": raw, "processed_at": now}).Error
}

func (r *Repository) MarkFailed(ctx context.Context, id uuid.UUID, code, message string, raw []byte) error {
	now := time.Now().UTC()
	return r.db.WithContext(ctx).Model(&PaymentCommand{}).Where("id = ?", id).Updates(map[string]any{"status": StatusFailed, "failure_code": code, "failure_message": message, "result_payload": raw, "processed_at": now}).Error
}

func (r *Repository) MarkStatus(ctx context.Context, businessID, id uuid.UUID, status Status) error {
	res := r.db.WithContext(ctx).Scopes(shareddb.BusinessScope(businessID)).Model(&PaymentCommand{}).Where("id = ?", id).Update("status", status)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return apperrors.ErrNotFound.WithMessage("payment not found")
	}
	return nil
}
