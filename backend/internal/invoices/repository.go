package invoices

import (
	"context"
	"fmt"
	"time"

	shareddb "github.com/Codecx-Org/FinAI/backend/internal/shared/db"
	apperrors "github.com/Codecx-Org/FinAI/backend/internal/shared/errors"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/pagination"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Repository struct{ db *gorm.DB }

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

func (r *Repository) NextNumber(ctx context.Context, businessID uuid.UUID) (string, error) {
	var count int64
	if err := r.db.WithContext(ctx).Model(&Invoice{}).Where("business_id = ?", businessID).Count(&count).Error; err != nil {
		return "", err
	}
	return fmt.Sprintf("INV-%s-%06d", businessID.String()[:8], count+1), nil
}

func (r *Repository) Create(ctx context.Context, invoice *Invoice, lines []InvoiceLine) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(invoice).Error; err != nil {
			return err
		}
		for i := range lines {
			lines[i].InvoiceID = invoice.ID
		}
		if len(lines) > 0 {
			return tx.Create(&lines).Error
		}
		return nil
	})
}

func (r *Repository) List(ctx context.Context, businessID uuid.UUID, page pagination.Page) ([]Invoice, error) {
	var items []Invoice
	err := r.db.WithContext(ctx).Scopes(shareddb.BusinessScope(businessID)).Preload("Lines").Order("created_at DESC").Limit(page.Limit).Offset(page.Offset).Find(&items).Error
	return items, err
}

func (r *Repository) Find(ctx context.Context, businessID, invoiceID uuid.UUID) (*Invoice, error) {
	var invoice Invoice
	err := r.db.WithContext(ctx).Scopes(shareddb.BusinessScope(businessID)).Preload("Lines").Where("id = ?", invoiceID).First(&invoice).Error
	if err != nil {
		return nil, err
	}
	return &invoice, nil
}

func (r *Repository) Update(ctx context.Context, invoice *Invoice) error {
	return r.db.WithContext(ctx).Save(invoice).Error
}

func (r *Repository) MarkOverdue(ctx context.Context, now time.Time) ([]Invoice, error) {
	var invoices []Invoice
	err := r.db.WithContext(ctx).Where("due_at IS NOT NULL AND due_at < ? AND status IN ?", now, []Status{StatusSent, StatusViewed, StatusPartial}).Find(&invoices).Error
	if err != nil {
		return nil, err
	}
	for _, invoice := range invoices {
		if err := r.db.WithContext(ctx).Model(&Invoice{}).Where("id = ?", invoice.ID).Update("status", StatusOverdue).Error; err != nil {
			return nil, err
		}
	}
	return invoices, nil
}

func (r *Repository) Delete(ctx context.Context, businessID, invoiceID uuid.UUID) error {
	res := r.db.WithContext(ctx).Scopes(shareddb.BusinessScope(businessID)).Where("id = ?", invoiceID).Delete(&Invoice{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return apperrors.ErrNotFound.WithMessage("invoice not found")
	}
	return nil
}
