package invoices

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"maps"
	"sort"
	"time"

	shareddb "github.com/Codecx-Org/FinAI/backend/internal/shared/db"
	apperrors "github.com/Codecx-Org/FinAI/backend/internal/shared/errors"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/outbox"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/pagination"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

type InvoiceEventType string

const (
	InvoiceOverdue InvoiceEventType = "invoice.overdue"
	InvoiceSent		 InvoiceEventType = "invoice.sent"
	InvoiceViewed	 InvoiceEventType =  "invoice.viewed"
	InvoicePaid    InvoiceEventType =   "invoice.paid"
	InvoiceCancelled 	InvoiceEventType = "invoice.cancelled"
)


type Service struct {
	repo   *Repository
	outbox outbox.Repository
}

func NewService(repo *Repository, outboxRepo outbox.Repository) *Service {
	return &Service{repo: repo, outbox: outboxRepo}
}

type LineRequest struct {
	ProductID   *uuid.UUID      `json:"productId"`
	Description string          `json:"description"`
	Quantity    decimal.Decimal `json:"quantity"`
	UnitPrice   decimal.Decimal `json:"unitPrice"`
}
type CreateInvoiceRequest struct {
	CustomerID *uuid.UUID    `json:"customerId"`
	OrderID 	 *uuid.UUID    `json:"orderId"`
	Currency   string        `json:"currency"`
	Notes      string        `json:"notes"`
	DueAt      *time.Time    `json:"dueAt"`
	Lines      []LineRequest `json:"lines"`
}
type RecordPaymentRequest struct {
	Amount    decimal.Decimal `json:"amount"`
	PaymentID *uuid.UUID      `json:"paymentId"`
	PaidAt    *time.Time      `json:"paidAt"`
}

func (s *Service) WithTx(tx *gorm.DB) *Service {
	if tx == nil {
		return s
	}

	return &Service{
		repo: s.repo.WithTx(tx),
		outbox: s.outbox,
	}
}

func (s *Service) CreateInvoice(ctx context.Context, businessID uuid.UUID, req CreateInvoiceRequest) (*Invoice, error) {
	if len(req.Lines) == 0 {
		return nil, apperrors.ErrUnprocessable.WithMessage("invoice requires at least one line")
	}
	number, err := s.repo.NextNumber(ctx, businessID)
	if err != nil {
		return nil, err
	}
	subtotal := decimal.Zero
	lines := make([]InvoiceLine, 0, len(req.Lines))

	for _, line := range req.Lines {
		if line.Description == "" {
			return nil, apperrors.ErrUnprocessable.WithMessage("invoice line description is required")
		}
		lineTotal := line.Quantity.Mul(line.UnitPrice).Round(2)
		subtotal = subtotal.Add(lineTotal)
		lines = append(lines, InvoiceLine{
			BaseModel: shareddb.BaseModel{
				TenantID: businessID,
			}, BusinessID: businessID, 
			ProductID: line.ProductID, 
			Description: line.Description, 
			Quantity: line.Quantity, 
			UnitPrice: line.UnitPrice, 
			LineTotal: lineTotal,
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
		BusinessID: businessID, 
		CustomerID: req.CustomerID, 
		OrderID: req.OrderID,
		InvoiceNumber: number, 
		Status: StatusDraft, 
		Subtotal: subtotal, 
		TaxAmount: tax, 
		Total: subtotal.Add(tax), 
		AmountPaid: decimal.Zero, 
		AmountDue: subtotal.Add(tax), 
		Currency: currency, 
		Notes: req.Notes, 
		DueAt: req.DueAt,
	}

	if err := s.repo.Create(ctx, invoice, lines); err != nil {
		return nil, err
	}
	return s.repo.Find(ctx, businessID, invoice.ID)
}

func (s *Service) List(ctx context.Context, businessID uuid.UUID, page pagination.Page) ([]Invoice, error) {
	return s.repo.List(ctx, businessID, page)
}
func (s *Service) Get(ctx context.Context, businessID, invoiceID uuid.UUID) (*Invoice, error) {
	return s.repo.Find(ctx, businessID, invoiceID)
}

func (s *Service) GetInvoiceByOrderID(ctx context.Context, businessID, invoiceID, orderID uuid.UUID) (*Invoice, error) {
	
	invoice, err := s.repo.FindByOrderId(ctx, businessID, invoiceID, orderID)

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
			if errors.Is(err, gorm.ErrRecordNotFound){
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
		err = s.emit(ctx, businessID, invoice.ID, InvoiceSent, map[string]any{"channel": channel})
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

func (s *Service) RecordPayment(ctx context.Context, businessID, invoiceID uuid.UUID, req RecordPaymentRequest) (*Invoice, error) {
	var inv *Invoice

	err := s.repo.db.Transaction(func(tx *gorm.DB) error {
		var err error
		inv, err = s.WithTx(tx).repo.Find(ctx, businessID, invoiceID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return apperrors.ErrNotFound.WithMessage("invoice record not found")
			}
			return err
		}
		if !req.Amount.IsPositive() {
			return apperrors.ErrUnprocessable.WithMessage("payment amount must be positive")
		}
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

			err := s.emit(ctx, businessID, inv.ID, InvoicePaid, map[string]any{"amount": inv.AmountPaid.String(), "paymentId": req.PaymentID})

			if err != nil {
				return err
			}
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	return inv, nil
}

func (s *Service) Cancel(ctx context.Context, businessID, invoiceID uuid.UUID) (*Invoice, error) {
	var invoice *Invoice

	err := s.repo.db.Transaction(func(tx *gorm.DB) error {
		var err error

	  invoice, err = s.WithTx(tx).repo.Find(ctx, businessID, invoiceID)	

		if err != nil{
			if errors.Is(err, gorm.ErrRecordNotFound){
				return apperrors.ErrNotFound.WithMessage("invoice record not found")
			}
			return err
		}

		invoice.Status = StatusCancelled	

		err = s.emit(ctx, businessID, invoiceID, InvoiceCancelled, map[string]any{"amount": invoice.Total})

		return err
	})


	if err != nil {
		return nil, err
	}

	return invoice, nil
}

func (s *Service) MarkOverdue(ctx context.Context, now time.Time) ([]Invoice, error) {

	var items []Invoice

	err := s.repo.db.Transaction(func(tx *gorm.DB) error {
		var err error

		items, err = s.WithTx(tx).repo.MarkOverdue(ctx, now)

		for _, inv := range items {
			err := s.emit(ctx, inv.BusinessID, inv.ID, InvoiceOverdue, map[string]any{"amount": inv.AmountDue})
			if err != nil {
				return err
			}
		}

		return err
	})

	if err != nil {
		return nil, err
	}

	return items, nil
}

func (s *Service) PDF(ctx context.Context, businessID, invoiceID uuid.UUID) ([]byte, error) {
	inv, err := s.repo.Find(ctx, businessID, invoiceID)
	if err != nil {
		return nil, err
	}
	return deterministicPDF(inv), nil
}
func deterministicPDF(inv *Invoice) []byte {
	var b bytes.Buffer
	lines := append([]InvoiceLine(nil), inv.Lines...)
	sort.Slice(lines, func(i, j int) bool { return lines[i].ID.String() < lines[j].ID.String() })
	b.WriteString("%PDF-1.4\n% BizSawa Invoice\n")
	b.WriteString(fmt.Sprintf("Invoice: %s\nStatus: %s\nSubtotal: %s\nTax: %s\nTotal: %s\nPaid: %s\nDue: %s\n", inv.InvoiceNumber, inv.Status, inv.Subtotal.StringFixed(2), inv.TaxAmount.StringFixed(2), inv.Total.StringFixed(2), inv.AmountPaid.StringFixed(2), inv.AmountDue.StringFixed(2)))
	for _, line := range lines {
		b.WriteString(fmt.Sprintf("Line: %s | %s | %s | %s\n", line.Description, line.Quantity.String(), line.UnitPrice.StringFixed(2), line.LineTotal.StringFixed(2)))
	}
	b.WriteString("%%EOF\n")
	return b.Bytes()
}

func (s *Service) emit(ctx context.Context, businessID, invoiceID uuid.UUID, eventType InvoiceEventType, extra map[string]any) (error){
	if s.outbox == nil {
		return fmt.Errorf("service outbox missing")
	}
	payload := map[string]any{"invoiceId": invoiceID, "businessId": businessID}
	
	maps.Copy(payload, extra)
	raw, _ := json.Marshal(payload)
	err := s.outbox.Insert(ctx, &outbox.Event{TenantID: businessID, AggregateID: invoiceID.String(), AggregateType: "invoice", EventType: string(eventType), Stream: "invoices", Payload: raw})

	if err != nil {
		log.Printf("error while submitting an outbox insert request: %v", err)
		return err
	}
	return nil
}
