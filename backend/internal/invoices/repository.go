package invoices

import (
	"context"
	"fmt"
	"time"

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
	if err != nil {
		return nil, err
	}
	// Enrich with customer and product names for UX (list page should show names, not IDs)
	r.enrichInvoices(ctx, businessID, items)

	return items, err
}

func (r *Repository) Find(ctx context.Context, businessID, invoiceID uuid.UUID) (*Invoice, error) {
	var invoice Invoice

	err := r.db.WithContext(ctx).Scopes(shareddb.BusinessScope(businessID)).Preload("Lines").Where("id = ?", invoiceID).First(&invoice).Error
	if err != nil {
		return nil, err
	}
	// Enrich single invoice with customer/product names
	if invoice.CustomerID != nil {
		type custRow struct {
			Name  string
			Phone string
		}

		var cr custRow

		_ = r.db.WithContext(ctx).Table("customers").Select("name, phone").Where("business_id = ? AND id = ?", businessID, *invoice.CustomerID).First(&cr).Error
		invoice.CustomerName = cr.Name
		invoice.CustomerPhone = cr.Phone
	}

	for i := range invoice.Lines {
		if invoice.Lines[i].ProductID != nil {
			var name string

			_ = r.db.WithContext(ctx).Table("products").Select("name").Where("business_id = ? AND id = ?", businessID, *invoice.Lines[i].ProductID).Row().Scan(&name)

			if name != "" {
				invoice.Lines[i].ProductName = name
				if invoice.Lines[i].Description == "" || isUUID(invoice.Lines[i].Description) {
					invoice.Lines[i].Description = name
				}
			}
		}
	}

	return &invoice, nil
}

func (r *Repository) enrichInvoices(ctx context.Context, businessID uuid.UUID, invoices []Invoice) {
	if len(invoices) == 0 {
		return
	}
	// Collect customer IDs and product IDs for batch lookup
	custIDs := make([]uuid.UUID, 0)
	prodIDs := make([]uuid.UUID, 0)
	custSet := make(map[uuid.UUID]bool)
	prodSet := make(map[uuid.UUID]bool)

	for _, inv := range invoices {
		if inv.CustomerID != nil && !custSet[*inv.CustomerID] {
			custSet[*inv.CustomerID] = true

			custIDs = append(custIDs, *inv.CustomerID)
		}

		for _, line := range inv.Lines {
			if line.ProductID != nil && !prodSet[*line.ProductID] {
				prodSet[*line.ProductID] = true

				prodIDs = append(prodIDs, *line.ProductID)
			}
		}
	}

	// Fetch customer names
	custMap := make(map[uuid.UUID]struct{ Name, Phone string })

	if len(custIDs) > 0 {
		type custRow struct {
			ID    uuid.UUID
			Name  string
			Phone string
		}

		var crows []custRow

		_ = r.db.WithContext(ctx).Table("customers").Select("id, name, phone").Where("business_id = ? AND id IN ?", businessID, custIDs).Find(&crows).Error

		for _, cr := range crows {
			custMap[cr.ID] = struct{ Name, Phone string }{cr.Name, cr.Phone}
		}
	}

	// Fetch product names
	prodMap := make(map[uuid.UUID]string)

	if len(prodIDs) > 0 {
		type prodRow struct {
			ID   uuid.UUID
			Name string
		}

		var prows []prodRow

		_ = r.db.WithContext(ctx).Table("products").Select("id, name").Where("business_id = ? AND id IN ?", businessID, prodIDs).Find(&prows).Error

		for _, pr := range prows {
			prodMap[pr.ID] = pr.Name
		}
	}

	for i := range invoices {
		if invoices[i].CustomerID != nil {
			if c, ok := custMap[*invoices[i].CustomerID]; ok {
				invoices[i].CustomerName = c.Name
				invoices[i].CustomerPhone = c.Phone
			}
		}
		// Fallback: if no customer found, keep empty (frontend will show "Customer")
		for j := range invoices[i].Lines {
			if invoices[i].Lines[j].ProductID != nil {
				if name, ok := prodMap[*invoices[i].Lines[j].ProductID]; ok {
					invoices[i].Lines[j].ProductName = name
					// If description is a UUID (legacy bug where productId stored in description), replace
					if invoices[i].Lines[j].Description == "" || isUUID(invoices[i].Lines[j].Description) {
						invoices[i].Lines[j].Description = name
					}
				}
			}
			// If product not found but description is UUID, leave as is — frontend has fallback
		}
	}
}

func isUUID(s string) bool {
	if len(s) != 36 {
		return false
	}

	_, err := uuid.Parse(s)

	return err == nil
}

func (r *Repository) FindByOrderId(ctx context.Context, businessID, orderID uuid.UUID, page pagination.Page) ([]Invoice, error) {
	var invoices []Invoice

	err := r.db.WithContext(ctx).Scopes(shareddb.BusinessScope(businessID)).Preload("Lines").Where("order_id = ?", orderID).Limit(page.Limit).Offset(page.Offset).Find(&invoices).Error
	if err != nil {
		return nil, err
	}

	return invoices, nil
}

func (r *Repository) Update(ctx context.Context, invoice *Invoice) error {
	return r.db.WithContext(ctx).Save(invoice).Error
}

func (r *Repository) FindUnpaidByCustomer(ctx context.Context, businessID, customerID uuid.UUID) ([]Invoice, error) {
	var invoices []Invoice

	err := r.db.WithContext(ctx).
		Scopes(shareddb.BusinessScope(businessID)).
		Where("customer_id = ? AND status IN ? AND amount_due > 0", customerID, []Status{StatusDraft, StatusSent, StatusViewed, StatusPartial, StatusOverdue}).
		Order("due_at ASC NULLS LAST, created_at ASC").
		Preload("Lines").
		Find(&invoices).Error

	return invoices, err
}

func (r *Repository) MarkOverdue(ctx context.Context, businessID uuid.UUID, now time.Time) ([]Invoice, error) {
	var invoices []Invoice

	err := r.db.WithContext(ctx).Scopes(shareddb.BusinessScope(businessID)).Where("due_at IS NOT NULL AND due_at < ? AND status IN ?", now, []Status{StatusSent, StatusViewed, StatusPartial}).Find(&invoices).Error
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
