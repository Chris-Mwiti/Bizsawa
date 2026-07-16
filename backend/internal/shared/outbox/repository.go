package outbox

import (
	"context"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type Repository interface {
	Insert(ctx context.Context, event *Event) error
	ClaimBatch(ctx context.Context, batchSize int) ([]Event, error)
	MarkSent(ctx context.Context, id uuid.UUID) error
	MarkFailed(ctx context.Context, id uuid.UUID, cause error) error
	WithTx(tx *gorm.DB) Repository
}

type GormRepository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *GormRepository {
	return &GormRepository{db: db}
}

func (r *GormRepository) WithTx(tx *gorm.DB) Repository {
	return &GormRepository{db: tx}
}

func (r *GormRepository) Insert(ctx context.Context, event *Event) error {
	if event.ID == uuid.Nil {
		event.ID = uuid.New()
	}
	if event.Status == "" {
		event.Status = StatusPending
	}
	if event.MaxAttempts == 0 {
		event.MaxAttempts = 5
	}
	if event.ScheduledAt.IsZero() {
		event.ScheduledAt = time.Now().UTC()
	}
	return r.db.WithContext(ctx).Create(event).Error
}

func (r *GormRepository) ClaimBatch(ctx context.Context, batchSize int) ([]Event, error) {
	if batchSize <= 0 {
		batchSize = 100
	}

	var events []Event
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE", Options: "SKIP LOCKED"}).
			Where("status = ? AND scheduled_at <= ?", StatusPending, time.Now().UTC()).
			Order("created_at ASC").
			Limit(batchSize).
			Find(&events).Error; err != nil {
			return err
		}
		for _, event := range events {
			if err := tx.Model(&Event{}).Where("id = ?", event.ID).Updates(map[string]any{
				"status":   StatusProcessing,
				"attempts": gorm.Expr("attempts + 1"),
			}).Error; err != nil {
				return err
			}
		}
		return nil
	})
	return events, err
}

func (r *GormRepository) MarkSent(ctx context.Context, id uuid.UUID) error {
	now := time.Now().UTC()
	return r.db.WithContext(ctx).Model(&Event{}).Where("id = ?", id).Updates(map[string]any{
		"status":  StatusSent,
		"sent_at": now,
	}).Error
}

func (r *GormRepository) MarkFailed(ctx context.Context, id uuid.UUID, cause error) error {
	return r.db.WithContext(ctx).Model(&Event{}).Where("id = ?", id).Updates(map[string]any{
		"status":       gorm.Expr("CASE WHEN attempts >= max_attempts THEN ? ELSE ? END", StatusDead, StatusPending),
		"scheduled_at": time.Now().UTC().Add(time.Minute),
	}).Error
}
