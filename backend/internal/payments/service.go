package payments

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"maps"

	"github.com/Codecx-Org/FinAI/backend/internal/invoices"
	"github.com/Codecx-Org/FinAI/backend/internal/orders"
	shareddb "github.com/Codecx-Org/FinAI/backend/internal/shared/db"
	apperrors "github.com/Codecx-Org/FinAI/backend/internal/shared/errors"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/middleware"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/models"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/pagination"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
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

type InovicePayment interface {
	RecordPayment(ctx context.Context, businessID, invoiceID uuid.UUID, req invoices.RecordPaymentRequest) (*invoices.Invoice, error) 

	Send(ctx context.Context, businessID, invoiceID uuid.UUID, channel string) (*invoices.Invoice, error) 
}

type OrderPayment interface {
	FindOrderByUpdate(ctx context.Context, businessID, orderID uuid.UUID) (*orders.Order, error) 
	FulfillOrder(ctx context.Context, businessID, orderID, staffID uuid.UUID) (*orders.Order, error) 
	Cancel(ctx context.Context, businessID, orderID uuid.UUID) error 
}

type Service struct {
	repo   *Repository
	outbox *river.Client[*sql.Tx] 
	logger *slog.Logger
}

func NewService(repo *Repository, outboxRepo *river.Client[*sql.Tx], logger *slog.Logger) *Service {
	return &Service{repo: repo, outbox: outboxRepo, logger: logger}
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

func (s *Service) Initiate(ctx context.Context, businessID uuid.UUID, req models.InitiateRequest) (*PaymentCommand, error) {
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
	case models.CommandB2C:
		req.Type = models.CommandB2C
		req.Provider = "mpesa"
	case models.CommandC2B:
		req.Type = models.CommandC2B
		req.Provider = "mpesa"
	case models.CommandSTKPush:
		req.Type = models.CommandSTKPush
		req.Provider = "mpesa"
	case models.CommandCash:
		req.Type = models.CommandCash
		req.Provider = "cash"
	default:
		req.Type = models.CommandCash
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

	//parse the orderID from the request payload
	orderID, err := uuid.Parse(req.OrderID)
	if err != nil {
		return nil, err
	}

	cmd := &PaymentCommand{
		BaseModel: shareddb.BaseModel{
			TenantID: businessID,
		}, 
		BusinessID: businessID, 
		OrderID: orderID,
		Type: CommandType(req.Type), 
		Status: StatusPending, 
		IdempotencyKey: key, 
		Amount: req.Amount, 
		Currency: currency, 
		Phone: req.Phone, 
		AccountReference: req.AccountReference, 
		Provider: req.Provider, 
		Payload: payload,
	}

	err = s.repo.db.Transaction(func(tx *gorm.DB) error {
		if err := s.WithTx(tx).repo.Create(ctx, cmd); err != nil {
			s.logger.ErrorContext(ctx, "[PAYMENTS]-error while creating paymentCmd", "err", err.Error(), "cmdID", cmd.ID.String())
			return err
		}
		sqlTx, ok := tx.Statement.ConnPool.(*sql.Tx)
		if !ok {
			return fmt.Errorf("error while asserting tx type")
		}
	
		err = s.emitCommand(ctx, sqlTx, cmd, PaymentCreated, map[string]any{})
		if err != nil {
			s.logger.ErrorContext(ctx, "[PAYMENTS]-error while emmiting event creating paymentCmd", "err", err.Error(), "cmdID", cmd.ID.String())
			return err
		}

		return nil
	})

	return cmd, nil
}

func (s *Service) InitiateOrder(ctx context.Context, businessID uuid.UUID, req models.InitiateRequest) (error) {
	key, ok := middleware.IdempotencyKeyFromCtx(ctx)
	if !ok {
		return errIdempotencyRequired()
	}
	if _, err := s.repo.FindByIdempotency(ctx, businessID, key); err == nil {
		return apperrors.ErrConflict.WithMessage("order request already initiated")
	}
	if !req.Amount.IsPositive() {
		return apperrors.ErrUnprocessable.WithMessage("payment amount must be positive")
	}
	
	switch req.Type {
	case models.CommandB2C:
		req.Type = models.CommandB2C
		req.Provider = "mpesa"
	case models.CommandC2B:
		req.Type = models.CommandC2B
		req.Provider = "mpesa"
	case models.CommandSTKPush:
		req.Type = models.CommandSTKPush
		req.Provider = "mpesa"
	case models.CommandCash:
		req.Type = models.CommandCash
		req.Provider = "cash"
	default:
		req.Type = models.CommandCash
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

	//parse the orderID from the request payload
	orderID, err := uuid.Parse(req.OrderID)
	if err != nil {
		return  err
	}

	cmd := &PaymentCommand{
		BaseModel: shareddb.BaseModel{
			TenantID: businessID,
		}, 
		BusinessID: businessID, 
		OrderID: orderID,
		Type: CommandType(req.Type), 
		Status: StatusPending, 
		IdempotencyKey: key, 
		Amount: req.Amount, 
		Currency: currency, 
		Phone: req.Phone, 
		AccountReference: req.AccountReference, 
		Provider: req.Provider, 
		Payload: payload,
	}

	err = s.repo.db.Transaction(func(tx *gorm.DB) error {
		if err := s.WithTx(tx).repo.Create(ctx, cmd); err != nil {
			s.logger.ErrorContext(ctx, "[PAYMENTS]-error while creating paymentCmd", "err", err.Error(), "cmdID", cmd.ID.String())
			return err
		}
		sqlTx, ok := tx.Statement.ConnPool.(*sql.Tx)
		if !ok {
			return fmt.Errorf("error while asserting tx type")
		}
	
		err = s.emitCommand(ctx, sqlTx, cmd, PaymentCreated, map[string]any{})
		if err != nil {
			s.logger.ErrorContext(ctx, "[PAYMENTS]-error while emmiting event creating paymentCmd", "err", err.Error(), "cmdID", cmd.ID.String())
			return err
		}

		return nil
	})

	return nil
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
			s.logger.ErrorContext(ctx, "[PAYMENTS]-error while fetching paymentCmd", "err", err.Error(), "cmdID", paymentCmd.ID.String())
			return err
		}
		sm := s.buildPaymentMachine(businessID, paymentCmd)

		if err := sm.FireCtx(ctx, TriggerProcessing); err != nil {
			return err
		}

		err = s.WithTx(tx).repo.ClaimSinglePayment(ctx, paymentCmd)

		if err != nil {
			s.logger.ErrorContext(ctx, "[PAYMENTS]-error while claming paymentCmd", "err", err.Error(), "cmdID", paymentCmd.ID.String())
			return err
		}

		sqlTx, ok := tx.Statement.ConnPool.(*sql.Tx)
		if !ok {
			return fmt.Errorf("error while asserting tx type")
		}
	
		err = s.emitCommand(ctx, sqlTx, paymentCmd, PaymentProcessing, map[string]any{})
		if err != nil {
			s.logger.ErrorContext(ctx, "[PAYMENTS]-error while emmiting event marking success paymentCmd", "err", err.Error(), "cmdID", paymentCmd.ID.String())
			return err
		}
	
		return err
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

	err := s.repo.db.Transaction(func(tx *gorm.DB) error {

		if err := s.WithTx(tx).repo.MarkSucceeded(ctx, cmd.ID, result.RequestID, result.Receipt, raw); err != nil {
			s.logger.ErrorContext(ctx, "[PAYMENTS]-error while marking success paymentCmd", "err", err.Error(), "cmdID", cmd.ID.String())
			return err
		}

		sqlTx, ok := tx.Statement.ConnPool.(*sql.Tx)
		if !ok {
			return fmt.Errorf("error while asserting tx type")
		}
		
		err := s.emitCommand(ctx, sqlTx, &cmd, PaymentConfirmed, map[string]any{})
		if err != nil {
			s.logger.ErrorContext(ctx, "[PAYMENTS]-error while emmiting event marking success paymentCmd", "err", err.Error(), "cmdID", cmd.ID.String())
			return err
		}

		return nil

	})
	

	return err
}

func (s *Service) MarkFailed(ctx context.Context, cmd PaymentCommand, code, message string, raw []byte) error {
	if len(raw) == 0 {
		raw = []byte(fmt.Sprintf(`{"code":%q,"message":%q}`, code, message))
	}

	err := s.repo.db.Transaction(func(tx *gorm.DB) error {

		if err := s.WithTx(tx).repo.MarkFailed(ctx, cmd.ID, code, message, raw); err != nil {
			s.logger.ErrorContext(ctx, "[PAYMENTS]-error while marking failed paymentCmd", "err", err.Error(), "cmd", cmd.ID.String())
			return err
		}

		sqlTx, ok := tx.Statement.ConnPool.(*sql.Tx)
		if !ok {
			return fmt.Errorf("error while asserting tx type")
		}
		
		err := s.emitCommand(ctx, sqlTx, &cmd, PaymentFailed, map[string]any{})
		if err != nil {
			s.logger.ErrorContext(ctx, "[PAYMENTS]-error while emmiting event marking failed paymentCmd", "err", err.Error(), "cmdID", cmd.ID.String())

			return err
		}

		return nil

	})
	
	return err
}

func (s *Service) emitCommand(ctx context.Context, tx *sql.Tx,cmd *PaymentCommand, eventType PaymentEventType, extras map[string]any) (error) {
	if s.outbox == nil {
		return apperrors.ErrInternal.WithMessage("service outbox not available")
	}
	payload := map[string]any{
		"paymentId": cmd.ID, 
		"businessId": cmd.BusinessID, 
		"type": cmd.Type, 
		"amount": cmd.Amount.String(), 
		"currency": cmd.Currency, 
		"phone": cmd.Phone, 
	}

	maps.Copy(payload, extras)

	err := s.emit(ctx, tx, cmd.BusinessID, cmd.ID, eventType, payload) 
	if err != nil {
		return apperrors.ErrInternal.WithMessage("error while emmiting command")
	}
	return nil
}


