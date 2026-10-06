package invoices

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"

	shareddb "github.com/Codecx-Org/FinAI/backend/internal/shared/db"
	apperrors "github.com/Codecx-Org/FinAI/backend/internal/shared/errors"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/pagination"
)

type InvoiceEventType string

const (
	InvoiceOverdue   InvoiceEventType = "invoice.overdue"
	InvoiceSent      InvoiceEventType = "invoice.sent"
	InvoiceViewed    InvoiceEventType = "invoice.viewed"
	InvoicePaid      InvoiceEventType = "invoice.paid"
	InvoiceCancelled InvoiceEventType = "invoice.cancelled"
)

type Service struct {
	repo   *Repository
	outbox *river.Client[*sql.Tx]
	logger *slog.Logger
}

func NewService(repo *Repository, outboxRepo *river.Client[*sql.Tx], logger *slog.Logger) *Service {
	return &Service{repo: repo, outbox: outboxRepo, logger: logger}
}

type LineRequest struct {
	ProductID   *uuid.UUID      `json:"productId"`
	Description string          `json:"description"`
	Quantity    decimal.Decimal `json:"quantity"`
	UnitPrice   decimal.Decimal `json:"unitPrice"`
}

type CreateInvoiceRequest struct {
	CustomerID *uuid.UUID    `json:"customerId"`
	OrderID    *uuid.UUID    `json:"orderId"`
	Currency   string        `json:"currency"`
	Notes      string        `json:"notes"`
	DueAt      *time.Time    `json:"dueAt"`
	Lines      []LineRequest `json:"lines"`
}

type RecordPaymentRequest struct {
	Amount    decimal.Decimal `json:"amount"`
	PaymentID uuid.UUID       `json:"paymentId"`
	PaidAt    *time.Time      `json:"paidAt"`
	Method    string          `json:"method"`
	Reference string          `json:"reference"`
}

func (s *Service) WithTx(tx *gorm.DB) *Service {
	if tx == nil {
		return s
	}

	return &Service{
		repo:   s.repo.WithTx(tx),
		outbox: s.outbox,
		logger: s.logger,
	}
}

func (s *Service) CreateInvoice(ctx context.Context, businessID uuid.UUID, req CreateInvoiceRequest) (*Invoice, error) {
	if len(req.Lines) == 0 {
		return nil, apperrors.ErrUnprocessable.WithMessage("invoice requires at least one line")
	}

	var inv *Invoice

	err := s.repo.db.Transaction(func(tx *gorm.DB) error {
		number, err := s.repo.NextNumber(ctx, businessID)
		if err != nil {
			s.logger.ErrorContext(ctx, "[INVOICES]-error while creating invoice next number", "businessID", businessID.String(), "err", err.Error())
			return apperrors.ErrInternal.WithMessage("error while creating next number for invoice")
		}

		subtotal := decimal.Zero
		lines := make([]InvoiceLine, 0, len(req.Lines))

		for _, line := range req.Lines {
			if line.Description == "" {
				return apperrors.ErrUnprocessable.WithMessage("invoice line description is required")
			}

			lineTotal := line.Quantity.Mul(line.UnitPrice).Round(2)
			subtotal = subtotal.Add(lineTotal)
			lines = append(lines, InvoiceLine{
				BaseModel: shareddb.BaseModel{
					TenantID: businessID,
				},
				BusinessID:  businessID,
				ProductID:   line.ProductID,
				Description: line.Description,
				Quantity:    line.Quantity,
				UnitPrice:   line.UnitPrice,
				LineTotal:   lineTotal,
			})
		}

		tax := subtotal.Mul(decimal.NewFromFloat(0.16)).Round(2)

		currency := req.Currency
		if currency == "" {
			currency = "KES"
		}

		invoice := &Invoice{
			BaseModel: shareddb.BaseModel{
				TenantID: businessID,
			},
			BusinessID:    businessID,
			CustomerID:    req.CustomerID,
			OrderID:       req.OrderID,
			InvoiceNumber: number,
			Status:        StatusDraft,
			Subtotal:      subtotal,
			TaxAmount:     tax,
			Total:         subtotal.Add(tax),
			AmountPaid:    decimal.Zero,
			AmountDue:     subtotal.Add(tax),
			Currency:      currency,
			Notes:         req.Notes,
			DueAt:         req.DueAt,
		}

		if err := s.WithTx(tx).repo.Create(ctx, invoice, lines); err != nil {
			s.logger.ErrorContext(ctx, "[INVOICE]- error while creating invoice", "buinessID", businessID.String(), "orderID", invoice.OrderID, "err", err)
			return err
		}

		inv, err = s.WithTx(tx).repo.Find(ctx, businessID, invoice.ID)
		if err != nil {
			s.logger.ErrorContext(ctx, "[INVOICE]- error while finding created invoice", "buinessID", businessID.String(), "invoiceID", invoice.ID, "err", err)
			return err
		}

		return nil
	})

	return inv, err
}

func (s *Service) List(ctx context.Context, businessID uuid.UUID, page pagination.Page) ([]Invoice, error) {
	return s.repo.List(ctx, businessID, page)
}

func (s *Service) Get(ctx context.Context, businessID, invoiceID uuid.UUID) (*Invoice, error) {
	return s.repo.Find(ctx, businessID, invoiceID)
}

func (s *Service) GetInvoiceByOrderID(ctx context.Context, businessID, orderID uuid.UUID, page pagination.Page) ([]Invoice, error) {
	invoice, err := s.repo.FindByOrderId(ctx, businessID, orderID, page)
	if err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}

		return nil, apperrors.ErrNotFound.WithMessage("invoice not found")
	}

	return invoice, nil
}

func (s *Service) Send(ctx context.Context, businessID, invoiceID uuid.UUID, channel string) (*Invoice, error) {
	var invoice *Invoice

	err := s.repo.db.Transaction(func(tx *gorm.DB) error {
		var err error

		invoice, err = s.WithTx(tx).repo.Find(ctx, businessID, invoiceID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return apperrors.ErrNotFound.WithMessage("invoice not found")
			}

			return err
		}

		now := time.Now().UTC()
		invoice.Status = StatusSent
		invoice.SentAt = &now

		if err := s.WithTx(tx).repo.Update(ctx, invoice); err != nil {
			return err
		}

		sqlTx, _ := tx.Statement.ConnPool.(*sql.Tx)

		err = s.WithTx(tx).emit(ctx, sqlTx, businessID, invoice.ID, InvoiceSent, map[string]any{"channel": channel})
		if err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	return invoice, nil
}

func (s *Service) RecordPayment(ctx context.Context, businessID, orderID uuid.UUID, req RecordPaymentRequest) error {
	var invoices []Invoice

	err := s.repo.db.Transaction(func(tx *gorm.DB) error {
		var err error

		invoices, err = s.WithTx(tx).repo.FindByOrderId(ctx, businessID, orderID, pagination.Page{Limit: 10})
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return apperrors.ErrNotFound.WithMessage("invoice record not found")
			}

			return err
		}

		if !req.Amount.IsPositive() {
			return apperrors.ErrUnprocessable.WithMessage("payment amount must be positive")
		}

		if len(invoices) <= 0 {
			return fmt.Errorf("no invoices found")
		}

		inv := &invoices[0]

		inv.AmountPaid = inv.AmountPaid.Add(req.Amount).Round(2)
		inv.AmountDue = inv.Total.Sub(inv.AmountPaid).Round(2)

		if inv.AmountDue.LessThanOrEqual(decimal.Zero) {
			inv.AmountDue = decimal.Zero
			inv.Status = StatusPaid

			paidAt := time.Now().UTC()
			if req.PaidAt != nil {
				paidAt = *req.PaidAt
			}

			inv.PaidAt = &paidAt
		} else {
			inv.Status = StatusPartial
		}

		if err := s.WithTx(tx).repo.Update(ctx, inv); err != nil {
			return err
		}

		if inv.Status == StatusPaid {
			sqlTx, _ := tx.Statement.ConnPool.(*sql.Tx)

			err := s.WithTx(tx).emit(ctx, sqlTx, businessID, inv.ID, InvoicePaid, map[string]any{
				"amount":    inv.AmountPaid.String(),
				"paymentId": req.PaymentID,
			})

			if err != nil {
				return err
			}
		}

		return nil
	})

	return err
}

// SettleCustomerPayment distributes a payment across all unpaid invoices for a customer (FIFO by due date)
// This satisfies the requirement that a payment for a customer settles unpaid invoices rather than a specific one.
// Works for both cash and mpesa — payment worker should call this with customerID derived from order or phone.
func (s *Service) SettleCustomerPayment(ctx context.Context, businessID, customerID uuid.UUID, req RecordPaymentRequest) (*SettleResult, error) {
	if !req.Amount.IsPositive() {
		return nil, apperrors.ErrUnprocessable.WithMessage("payment amount must be positive")
	}

	if customerID == uuid.Nil {
		return nil, apperrors.ErrUnprocessable.WithMessage("customerId is required")
	}

	var result SettleResult

	err := s.repo.db.Transaction(func(tx *gorm.DB) error {
		invoices, err := s.WithTx(tx).repo.FindUnpaidByCustomer(ctx, businessID, customerID)
		if err != nil {
			return err
		}

		if len(invoices) == 0 {
			return apperrors.ErrNotFound.WithMessage("no unpaid invoices for this customer")
		}

		remaining := req.Amount

		paidAt := time.Now().UTC()
		if req.PaidAt != nil {
			paidAt = *req.PaidAt
		}

		for i := range invoices {
			if remaining.LessThanOrEqual(decimal.Zero) {
				break
			}

			inv := &invoices[i]

			due := inv.AmountDue
			if due.LessThanOrEqual(decimal.Zero) {
				continue
			}

			apply := remaining
			if apply.GreaterThan(due) {
				apply = due
			}

			inv.AmountPaid = inv.AmountPaid.Add(apply).Round(2)
			inv.AmountDue = inv.Total.Sub(inv.AmountPaid).Round(2)

			if inv.AmountDue.LessThanOrEqual(decimal.Zero) {
				inv.AmountDue = decimal.Zero
				inv.Status = StatusPaid
				inv.PaidAt = &paidAt
			} else {
				inv.Status = StatusPartial
			}

			if err := s.WithTx(tx).repo.Update(ctx, inv); err != nil {
				return err
			}

			result.Allocations = append(result.Allocations, Allocation{
				InvoiceID:     inv.ID,
				InvoiceNumber: inv.InvoiceNumber,
				Amount:        apply,
				Status:        string(inv.Status),
			})
			result.TotalApplied = result.TotalApplied.Add(apply)
			remaining = remaining.Sub(apply).Round(2)

			if inv.Status == StatusPaid {
				sqlTx, _ := tx.Statement.ConnPool.(*sql.Tx)
				_ = s.WithTx(tx).emit(ctx, sqlTx, businessID, inv.ID, InvoicePaid, map[string]any{
					"amount":     apply.String(),
					"paymentId":  req.PaymentID,
					"customerId": customerID.String(),
				})
			}
		}

		result.RemainingCredit = remaining
		if result.TotalApplied.IsZero() {
			return apperrors.ErrUnprocessable.WithMessage("payment could not be applied to any invoice")
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	return &result, nil
}

type Allocation struct {
	InvoiceID     uuid.UUID       `json:"invoiceId"`
	InvoiceNumber string          `json:"invoiceNumber"`
	Amount        decimal.Decimal `json:"amount"`
	Status        string          `json:"status"`
}

type SettleResult struct {
	Allocations     []Allocation    `json:"allocations"`
	TotalApplied    decimal.Decimal `json:"totalApplied"`
	RemainingCredit decimal.Decimal `json:"remainingCredit"`
}

func (s *Service) Cancel(ctx context.Context, businessID, invoiceID uuid.UUID) (*Invoice, error) {
	var invoice *Invoice

	err := s.repo.db.Transaction(func(tx *gorm.DB) error {
		var err error

		invoice, err = s.WithTx(tx).repo.Find(ctx, businessID, invoiceID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return apperrors.ErrNotFound.WithMessage("invoice record not found")
			}

			return err
		}

		invoice.Status = StatusCancelled
		if err := s.WithTx(tx).repo.Update(ctx, invoice); err != nil {
			return err
		}

		sqlTx, _ := tx.Statement.ConnPool.(*sql.Tx)
		err = s.WithTx(tx).emit(ctx, sqlTx, businessID, invoiceID, InvoiceCancelled, map[string]any{"amount": invoice.Total.String()})

		return err
	})

	if err != nil {
		s.logger.ErrorContext(ctx, "[INVOICES]-error while cancelling order", "businessID", businessID.String(), "err", err)
		return nil, err
	}

	return invoice, err
}

func (s *Service) MarkOverdue(ctx context.Context, businessID uuid.UUID, now time.Time) ([]Invoice, error) {
	var items []Invoice

	err := s.repo.db.Transaction(func(tx *gorm.DB) error {
		var err error

		items, err = s.WithTx(tx).repo.MarkOverdue(ctx, businessID, now)
		if err != nil {
			return err
		}

		sqlTx, _ := tx.Statement.ConnPool.(*sql.Tx)
		for _, inv := range items {
			err := s.WithTx(tx).emit(ctx, sqlTx, inv.BusinessID, inv.ID, InvoiceOverdue, map[string]any{"amount": inv.AmountDue.String()})
			if err != nil {
				s.logger.ErrorContext(ctx, "[INVOICES]-error while marking invoice overdue", "invoiceID", inv.ID.String(), "err", err)
				return err
			}
		}

		return nil
	})

	if err != nil {
		s.logger.ErrorContext(ctx, "[INVOICES]-error while marking overdue order", "err", err)
		return nil, err
	}

	return items, nil
}

func (s *Service) PDF(ctx context.Context, businessID, invoiceID uuid.UUID) ([]byte, error) {
	inv, err := s.repo.Find(ctx, businessID, invoiceID)
	if err != nil {
		return nil, err
	}

	// Enrich with business shop header (owner shop as invoice source)
	var business struct {
		Name    string `gorm:"column:name"`
		Phone   string `gorm:"column:phone"`
		Email   string `gorm:"column:email"`
		Address string `gorm:"column:address"`
		TaxPIN  string `gorm:"column:tax_pin"`
	}

	if err := s.repo.db.WithContext(ctx).Table("businesses").Select("name, phone, email, address, tax_pin").Where("id = ?", businessID).First(&business).Error; err != nil {
		slog.ErrorContext(ctx, "database operation failed", "err", err)
	}

	return deterministicPDF(inv, business), nil
}

func deterministicPDF(inv *Invoice, business struct {
	Name    string `gorm:"column:name"`
	Phone   string `gorm:"column:phone"`
	Email   string `gorm:"column:email"`
	Address string `gorm:"column:address"`
	TaxPIN  string `gorm:"column:tax_pin"`
}) []byte {
	var b bytes.Buffer

	lines := append([]InvoiceLine(nil), inv.Lines...)
	sort.Slice(lines, func(i, j int) bool { return lines[i].ID.String() < lines[j].ID.String() })
	// Minimal compliant PDF with business shop as source title
	b.WriteString("%PDF-1.4\n% BizSawa Invoice\n")

	shopTitle := business.Name
	if shopTitle == "" {
		shopTitle = "Business Shop"
	}

	b.WriteString(fmt.Sprintf("%% Title: %s — Invoice %s\n", shopTitle, inv.InvoiceNumber))
	b.WriteString(fmt.Sprintf("From: %s\n", shopTitle))

	if business.Address != "" {
		b.WriteString(fmt.Sprintf("Address: %s\n", business.Address))
	}

	if business.Phone != "" {
		b.WriteString(fmt.Sprintf("Phone: %s\n", business.Phone))
	}

	if business.Email != "" {
		b.WriteString(fmt.Sprintf("Email: %s\n", business.Email))
	}

	if business.TaxPIN != "" {
		b.WriteString(fmt.Sprintf("KRA PIN: %s\n", business.TaxPIN))
	}

	if inv.CustomerName != "" {
		b.WriteString(fmt.Sprintf("Bill To: %s", inv.CustomerName))

		if inv.CustomerPhone != "" {
			b.WriteString(fmt.Sprintf(" (%s)", inv.CustomerPhone))
		}

		b.WriteString("\n")
	}

	b.WriteString(
		fmt.Sprintf("Invoice: %s\nStatus: %s\nSubtotal: %s\nTax: %s\nTotal: %s\nPaid: %s\nDue: %s\n",
			inv.InvoiceNumber,
			inv.Status,
			inv.Subtotal.StringFixed(2),
			inv.TaxAmount.StringFixed(2),
			inv.Total.StringFixed(2),
			inv.AmountPaid.StringFixed(2),
			inv.AmountDue.StringFixed(2),
		),
	)

	for _, line := range lines {
		name := line.ProductName
		if name == "" {
			name = line.Description
		}

		b.WriteString(
			fmt.Sprintf("Line: %s | %s | %s | %s\n",
				name,
				line.Quantity.String(),
				line.UnitPrice.StringFixed(2),
				line.LineTotal.StringFixed(2),
			),
		)
	}

	b.WriteString("%%EOF\n")

	return b.Bytes()
}
