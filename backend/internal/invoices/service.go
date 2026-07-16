package invoices

import (
	"bytes"
	"context"
	"encoding/json"
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

func (s *Service) Create(ctx context.Context, businessID uuid.UUID, req CreateInvoiceRequest) (*Invoice, error) {
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
func (s *Service) Send(ctx context.Context, businessID, invoiceID uuid.UUID, channel string) (*Invoice, error) {
	inv, err := s.repo.Find(ctx, businessID, invoiceID)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	inv.Status = StatusSent
	inv.SentAt = &now
	if err := s.repo.Update(ctx, inv); err != nil {
		return nil, err
	}
	s.emit(ctx, businessID, inv.ID, "invoice.sent", map[string]any{"channel": channel})
	return inv, nil
}

func (s *Service) RecordPayment(ctx context.Context, businessID, invoiceID uuid.UUID, req RecordPaymentRequest) (*Invoice, error) {
	inv, err := s.repo.Find(ctx, businessID, invoiceID)
	if err != nil {
		return nil, err
	}
	if !req.Amount.IsPositive() {
		return nil, apperrors.ErrUnprocessable.WithMessage("payment amount must be positive")
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
	if err := s.repo.Update(ctx, inv); err != nil {
		return nil, err
	}
	if inv.Status == StatusPaid {
		s.emit(ctx, businessID, inv.ID, "invoice.paid", map[string]any{"amountPaid": inv.AmountPaid.String(), "paymentId": req.PaymentID})
	}
	return inv, nil
}
func (s *Service) Cancel(ctx context.Context, businessID, invoiceID uuid.UUID) (*Invoice, error) {
	inv, err := s.repo.Find(ctx, businessID, invoiceID)
	if err != nil {
		return nil, err
	}
	inv.Status = StatusCancelled
	return inv, s.repo.Update(ctx, inv)
}
func (s *Service) MarkOverdue(ctx context.Context, now time.Time) ([]Invoice, error) {
	items, err := s.repo.MarkOverdue(ctx, now)
	if err != nil {
		return nil, err
	}
	for _, inv := range items {
		s.emit(ctx, inv.BusinessID, inv.ID, "invoice.overdue", nil)
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
func (s *Service) emit(ctx context.Context, businessID, invoiceID uuid.UUID, eventType string, extra map[string]any) {
	if s.outbox == nil {
		return
	}
	payload := map[string]any{"invoiceId": invoiceID, "businessId": businessID}
	
	maps.Copy(payload, extra)
	raw, _ := json.Marshal(payload)
	err := s.outbox.Insert(ctx, &outbox.Event{TenantID: businessID, AggregateID: invoiceID.String(), AggregateType: "invoice", EventType: eventType, Stream: "invoices", Payload: raw})

	if err != nil {
		log.Printf("error while submitting an outbox insert request: %v", err)
		return
	}
}
