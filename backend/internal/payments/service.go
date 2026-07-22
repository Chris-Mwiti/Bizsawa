package payments

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"

	shareddb "github.com/Codecx-Org/FinAI/backend/internal/shared/db"
	apperrors "github.com/Codecx-Org/FinAI/backend/internal/shared/errors"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/middleware"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/outbox"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/pagination"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

type PaymentEventType string

const PaymentStream = "payments"

const (
	PaymentCreated   PaymentEventType = "payment.created"
	PaymentConfirmed PaymentEventType = "payment.confirmed"
	PaymentProcessing PaymentEventType = "payment.processing"
	PaymentFailed 		PaymentEventType = "payment.failed"
	PaymentRetry      PaymentEventType = "payment.retry"
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
	Amount           decimal.Decimal `json:"amount"`
	Currency         string          `json:"currency"`
	Phone            string          `json:"phone"`
	AccountReference string          `json:"accountReference"`
	Provider				 string           `json:"provider"`
	Payload          map[string]any  `json:"payload"`
}
type ProviderResult struct {
	RequestID string
	Receipt   string
	Raw       json.RawMessage
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
	
	switch req.Type {
	case CommandB2C:
		req.Type = CommandB2C
		req.Provider = "mpesa"
	case CommandC2B:
		req.Type = CommandC2B
		req.Provider = "mpesa"
	case CommandSTKPush:
		req.Type = CommandSTKPush
		req.Provider = "mpesa"
	case CommandCash:
		req.Type = CommandCash
		req.Provider = "cash"
	default:
		req.Type = CommandCash
		req.Provider = "cash"
	}

	if len(req.Payload) > 0 {
		if val, ok := req.Payload["invoiceID"].(string); ok {
			req.AccountReference = val
		}
	} else {
		//create an accountreference by hashing both the reqType+reqAmount+orderID
		hash := sha256.New()

		hash.Write([]byte(req.Type))
		hash.Write([]byte(req.Amount.String()))
		hash.Write([]byte(req.Provider))

		result := hash.Sum(nil)

		hexString := hex.EncodeToString(result)

		req.AccountReference = hexString
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
		Type: req.Type, 
		Status: StatusPending, 
		IdempotencyKey: key, 
		Amount: req.Amount, 
		Currency: currency, 
		Phone: req.Phone, 
		AccountReference: req.AccountReference, 
		Provider: req.Provider, 
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

func (s *Service) ClaimPayment(ctx context.Context, businessID, cmdId uuid.UUID) (error) {

	err := s.repo.db.Transaction(func(tx *gorm.DB) error {

		paymentCmd, err := s.WithTx(tx).Get(ctx, businessID, cmdId);

		if err != nil {
			return err
		}
		sm := s.buildPaymentMachine(businessID, paymentCmd)

		if err := sm.FireCtx(ctx, TriggerProcessing); err != nil {
			return err
		}

		err = s.WithTx(tx).repo.ClaimSinglePayment(ctx, paymentCmd)

		if err != nil {
			return err
		}
		
		return s.emitProcessingCmd(ctx, paymentCmd)

	})

	return err

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
	})
	err := s.outbox.Insert(ctx, &outbox.Event{
		TenantID: cmd.BusinessID, 
		AggregateID: cmd.ID.String(), 
		AggregateType: "payment_command", 
		EventType:  string(PaymentCreated), 
		Stream: "payments.commands", 
		Payload: raw,
	})

	if err != nil {
		return apperrors.ErrInternal.WithMessage("error while emmiting command")
	}
	return nil
}

func (s *Service) emitProcessingCmd(ctx context.Context, cmd *PaymentCommand) (error) {
	if s.outbox == nil {
		return apperrors.ErrInternal.WithMessage("service outbox not available")
	}

	raw, _ := json.Marshal(map[string]any{
		"paymentId": cmd.ID,
		"businessId": cmd.BusinessID,
		"amount": cmd.Amount.String(),
		"currency": cmd.Currency,
		"phone": cmd.Phone,
	})

	err := s.outbox.Insert(ctx, &outbox.Event{
		TenantID: cmd.TenantID,
		AggregateID: cmd.ID.String(),
		AggregateType: "payment_command",
		EventType: "payment.command.processing",
		Stream: "payments.commands",
		Payload: raw,
	})

	if err != nil {
		return err
	}

	return nil
}

func (s *Service) emitRetryCommand(ctx context.Context, cmd *PaymentCommand) (error) {
	if s.outbox == nil {
		return apperrors.ErrInternal.WithMessage("service outbox not available")
	}

	raw, _ := json.Marshal(
		map[string]any{
			"paymentId": cmd.ID,
			"businessId": cmd.BusinessID,
			"amount": cmd.Amount.String(),
			"currency": cmd.Currency,
			"phone": cmd.Phone,
	})

	err := s.outbox.Insert(ctx, &outbox.Event{
		TenantID: cmd.TenantID,
		AggregateID: cmd.ID.String(),
		AggregateType: "payment_command",
		EventType: "payment.command.retry",
		Stream: "payments.commands",
		Payload: raw,
	})

	if err != nil {
		return apperrors.ErrInternal.WithMessage("error while emmitting command")
	}

	return nil
}

func (s *Service) emitFail(ctx context.Context, cmd PaymentCommand) (error) {
	if s.outbox == nil {
		return apperrors.ErrInternal.WithMessage("service outbox not available")
	}

	raw, _ := json.Marshal(
		map[string]any{
			"paymentId": cmd.ID,
			"businessId": cmd.BusinessID,
			"amount": cmd.Amount.String(),
			"currency": cmd.Currency,
			"phone": cmd.Phone,
	})

	err := s.outbox.Insert(ctx, &outbox.Event{
		TenantID: cmd.TenantID,
		AggregateID: cmd.ID.String(),
		AggregateType: "payment_command",
		EventType: "payment.command.fail",
		Stream: string(PaymentStream),
		Payload: raw,
	})

	if err != nil {
		return apperrors.ErrInternal.WithMessage("error while emmitting command")
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
