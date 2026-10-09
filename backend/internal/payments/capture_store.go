package payments

import (
	"context"

	"github.com/google/uuid"

	"github.com/Codecx-Org/FinAI/backend/internal/shared/pagination"
)

// Capture repository helpers (ingest path). Queries are always
// business-scoped — tenant isolation is structural, not conventional.

func (r *Repository) FindCaptureByEvent(ctx context.Context, businessID, eventID uuid.UUID) (*CapturedPayment, error) {
	var p CapturedPayment
	err := r.db.WithContext(ctx).
		Where("business_id = ? AND client_event_id = ? AND deleted_at IS NULL", businessID, eventID).
		First(&p).Error
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *Repository) FindCaptureByReceipt(ctx context.Context, businessID uuid.UUID, receipt string) (*CapturedPayment, error) {
	var p CapturedPayment
	err := r.db.WithContext(ctx).
		Where("business_id = ? AND mpesa_receipt = ? AND deleted_at IS NULL", businessID, receipt).
		First(&p).Error
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *Repository) CreateCapture(ctx context.Context, p *CapturedPayment) error {
	return r.db.WithContext(ctx).Create(p).Error
}

func (r *Repository) UpdateCapture(ctx context.Context, p *CapturedPayment) error {
	return r.db.WithContext(ctx).Save(p).Error
}

type CaptureFilter struct {
	Source   string
	Status   string
	Channel  string
	From     string
	To       string
	Page     pagination.Page
}

func (r *Repository) ListCaptured(ctx context.Context, businessID uuid.UUID, f CaptureFilter) ([]CapturedPayment, error) {
	var items []CapturedPayment
	q := r.db.WithContext(ctx).Where("business_id = ? AND deleted_at IS NULL", businessID)
	if f.Source != "" {
		q = q.Where("source = ?", f.Source)
	}
	if f.Status != "" {
		q = q.Where("verification_status = ?", f.Status)
	}
	if f.Channel != "" {
		q = q.Where("channel_type = ?", f.Channel)
	}
	if f.From != "" {
		q = q.Where("occurred_at >= ?", f.From)
	}
	if f.To != "" {
		q = q.Where("occurred_at <= ?", f.To)
	}
	err := q.Order("occurred_at DESC").Limit(f.Page.Limit).Offset(f.Page.Offset).Find(&items).Error
	return items, err
}

func (r *Repository) CreateDevice(ctx context.Context, d *CaptureDevice) error {
	return r.db.WithContext(ctx).Create(d).Error
}

func (r *Repository) FindDevice(ctx context.Context, businessID, deviceID uuid.UUID) (*CaptureDevice, error) {
	var d CaptureDevice
	err := r.db.WithContext(ctx).
		Where("business_id = ? AND id = ? AND deleted_at IS NULL", businessID, deviceID).
		First(&d).Error
	if err != nil {
		return nil, err
	}
	return &d, nil
}
