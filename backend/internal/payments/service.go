package payments

import (
	"context"
	"encoding/json"
	"fmt"

	shareddb "github.com/Codecx-Org/FinAI/backend/internal/shared/db"
	apperrors "github.com/Codecx-Org/FinAI/backend/internal/shared/errors"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/middleware"
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

type InitiateRequest struct {
	Type             CommandType     `json:"type"`
	InvoiceID        *uuid.UUID      `json:"invoiceId"`
	Amount           decimal.Decimal `json:"amount"`
	Currency         string          `json:"currency"`
	Phone            string          `json:"phone"`
	AccountReference string          `json:"accountReference"`
	Payload          map[string]any  `json:"payload"`
}
type ProviderResult struct {
	RequestID string
	Receipt   string
	Raw       json.RawMessage
}

func (s *Service) Initiate(ctx context.Context, businessID uuid.UUID, req InitiateRequest) (*PaymentCommand, error) {
	key, ok := middleware.IdempotencyKeyFromCtx(ctx)
	if !ok {
		return nil, errIdempotencyRequired()
	}
	if existing, err := s.repo.FindByIdempotency(ctx, businessID, key); err == nil {
		return existing, nil
	}
	if !req.Amount.IsPositive() {
		return nil, apperrors.ErrUnprocessable.WithMessage("payment amount must be positive")
	}
	if req.Type == "" {
		req.Type = CommandSTKPush
	}
	currency := req.Currency
	if currency == "" {
		currency = "KES"
	}
	payload, _ := json.Marshal(req.Payload)
	if len(payload) == 0 {
		payload = []byte(`{}`)
	}
	cmd := &PaymentCommand{
		BaseModel: shareddb.BaseModel{
			TenantID: businessID,
		}, 
		BusinessID: businessID, 
		InvoiceID: req.InvoiceID, 
		Type: req.Type, 
		Status: StatusPending, 
		IdempotencyKey: key, 
		Amount: req.Amount, 
		Currency: currency, 
		Phone: req.Phone, 
		AccountReference: req.AccountReference, 
		Provider: "mpesa", 
		Payload: payload,
	}
	if err := s.repo.Create(ctx, cmd); err != nil {
		return nil, err
	}

	err := s.emitCommand(ctx, cmd)
	if err != nil {
		return nil, err
	}
	return cmd, nil
}

func (s *Service) Get(ctx context.Context, businessID, id uuid.UUID) (*PaymentCommand, error) {
	return s.repo.Find(ctx, businessID, id)
}

func (s *Service) List(ctx context.Context, businessID uuid.UUID, page pagination.Page) ([]PaymentCommand, error) {
	return s.repo.List(ctx, businessID, page)
}

func (s *Service) ClaimPending(ctx context.Context, limit int) ([]PaymentCommand, error) {
	return s.repo.ClaimPending(ctx, limit)
}

func (s *Service) MarkSucceeded(ctx context.Context, cmd PaymentCommand, result ProviderResult) error {
	raw := result.Raw
	if len(raw) == 0 {
		raw, _ = json.Marshal(map[string]any{"requestId": result.RequestID, "receipt": result.Receipt})
	}
	if err := s.repo.MarkSucceeded(ctx, cmd.ID, result.RequestID, result.Receipt, raw); err != nil {
		return err
	}

	err := s.emitResult(ctx, cmd, StatusSucceeded, result.RequestID, result.Receipt, "", "")
	if err != nil {
		return nil
	}

	return nil
}

func (s *Service) MarkFailed(ctx context.Context, cmd PaymentCommand, code, message string, raw []byte) error {
	if len(raw) == 0 {
		raw = []byte(fmt.Sprintf(`{"code":%q,"message":%q}`, code, message))
	}
	if err := s.repo.MarkFailed(ctx, cmd.ID, code, message, raw); err != nil {
		return err
	}

	err := s.emitResult(ctx, cmd, StatusFailed, "", "", code, message)
	if err != nil {
		return nil
	}

	return nil
}

func (s *Service) emitCommand(ctx context.Context, cmd *PaymentCommand) (error) {
	if s.outbox == nil {
		return apperrors.ErrInternal.WithMessage("service outbox not available")
	}
	raw, _ := json.Marshal(
		map[string]any{
		"paymentId": cmd.ID, 
		"businessId": cmd.BusinessID, 
		"type": cmd.Type, 
		"amount": cmd.Amount.String(), 
		"currency": cmd.Currency, 
		"phone": cmd.Phone, 
		"invoiceId": cmd.InvoiceID,
	})
	err := s.outbox.Insert(ctx, &outbox.Event{
		TenantID: cmd.BusinessID, 
		AggregateID: cmd.ID.String(), 
		AggregateType: "payment_command", 
		EventType: "payment.command.created", 
		Stream: "payments.commands", 
		Payload: raw,
	})

	if err != nil {
		return apperrors.ErrInternal.WithMessage("error while emmiting command")
	}
	return nil
}

func (s *Service) emitResult(ctx context.Context, cmd PaymentCommand, status Status, requestID, receipt, code, message string) (error){
	if s.outbox == nil {
		return nil
	}
	raw, _ := json.Marshal(
		ResultEvent{
			PaymentID: cmd.ID, 
			BusinessID: cmd.BusinessID, 
			Status: status, 
			Provider: cmd.Provider, 
			ProviderRequestID: requestID, 
			ProviderReceipt: receipt, 
			Amount: cmd.Amount, 
			FailureCode: code, 
			FailureMessage: message,
		})
		err := s.outbox.Insert(ctx, &outbox.Event{TenantID: cmd.BusinessID, AggregateID: cmd.ID.String(), AggregateType: "payment_command", EventType: "payment.result", Stream: "payments.results", Payload: raw})
		if err != nil {
			return apperrors.ErrInternal.WithMessage("error while emmiting result command")
		}

		return nil
}
