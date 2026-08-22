package payments

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"maps"
	"strconv"
	"strings"

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
	PaymentCreated    PaymentEventType = "payment.created"
	PaymentConfirmed  PaymentEventType = "payment.confirmed"
	PaymentProcessing PaymentEventType = "payment.processing"
	PaymentFailed     PaymentEventType = "payment.failed"
	PaymentRetry      PaymentEventType = "payment.retry"
)

type InovicePayment interface {
	RecordPayment(ctx context.Context, businessID, orderID uuid.UUID, req invoices.RecordPaymentRequest) (error)

	Send(ctx context.Context, businessID, invoiceID uuid.UUID, channel string) (*invoices.Invoice, error)
}

type OrderPayment interface {
	FindOrderByUpdate(ctx context.Context, businessID, orderID uuid.UUID) (*orders.Order, error)
	FulfillOrder(ctx context.Context, businessID, orderID, staffID uuid.UUID) (*orders.Order, error)
	PaymentUpdate(ctx context.Context, businessID, orderID uuid.UUID, status orders.PaymentStatus)(error)
	Cancel(ctx context.Context, businessID, orderID uuid.UUID) error
}

type Provider interface {
	ProcessPayment(ctx context.Context, cmd PaymentCommand) (ProviderResult, error)
}

type Service struct {
	repo     *Repository
	outbox   *river.Client[*sql.Tx]
	logger   *slog.Logger
	provider Provider
}

func NewService(repo *Repository, outboxRepo *river.Client[*sql.Tx], logger *slog.Logger, provider Provider) *Service {
	if logger == nil {
		logger = slog.Default()
	}
	return &Service{repo: repo, outbox: outboxRepo, logger: logger, provider: provider}
}

type ProviderResult struct {
	RequestID string
	Receipt   string
	Raw       json.RawMessage
	Status    Status
}

func (s *Service) WithTx(tx *gorm.DB) *Service {
	if tx == nil {
		return s
	}

	return &Service{
		repo:     s.repo.WithTx(tx),
		outbox:   s.outbox,
		logger:   s.logger,
		provider: s.provider,
	}
}

func (s *Service) Initiate(ctx context.Context, businessID uuid.UUID, req models.InitiateRequest) (*PaymentCommand, error) {
	s.logger.InfoContext(ctx, "[PAYMENTS]-initiating payments", "businessID", businessID.String(), "orderID", req.OrderID)
	key, ok := middleware.IdempotencyKeyFromCtx(ctx)
	if !ok {
		return nil, errIdempotencyRequired()
	}

	existing, err := s.repo.FindByIdempotency(ctx, businessID, key)
	if err != nil {
		s.logger.ErrorContext(ctx, "[PAYMENTS]-Idemptency key not valid", "err", err.Error())
		return nil, err
	}

	if existing != nil  {
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
		BusinessID:       businessID,
		OrderID:          orderID,
		Type:             CommandType(req.Type),
		Status:           StatusPending,
		IdempotencyKey:   key,
		Amount:           req.Amount,
		Currency:         currency,
		Phone:            req.Phone,
		AccountReference: req.AccountReference,
		Provider:         req.Provider,
		Payload:          payload,
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

func (s *Service) InitiateOrder(ctx context.Context, businessID uuid.UUID, req models.InitiateRequest, key string) error {
	s.logger.InfoContext(ctx, "[PAYMENTS]-initiating order request for order", "orderID", req.OrderID, "businessID", businessID.String())

	_, err := s.repo.FindByIdempotency(ctx, businessID, key)
	if err != nil {
		s.logger.InfoContext(ctx, "[PAYMENTS]-error while finding by idempotency key", "err", err.Error())
		if !errors.Is(err, gorm.ErrRecordNotFound){
			s.logger.ErrorContext(ctx, "[PAYMENTS]-error while finding by idempotency key", "err", err.Error())
			return err
		}
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
		return err
	}

	cmd := &PaymentCommand{
		BaseModel: shareddb.BaseModel{
			TenantID: businessID,
		},
		BusinessID:       businessID,
		OrderID:          orderID,
		Type:             CommandType(req.Type),
		Status:           StatusPending,
		IdempotencyKey:   key,
		Amount:           req.Amount,
		Currency:         currency,
		Phone:            req.Phone,
		AccountReference: req.AccountReference,
		Provider:         req.Provider,
		Payload:          payload,
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

func (s *Service) ExecuteProvider(ctx context.Context, businessID, cmdID uuid.UUID) error {
	if s.provider == nil {
		return apperrors.ErrInternal.WithMessage("payment provider not configured")
	}
	err := s.repo.db.Transaction(func(tx *gorm.DB) error {
		cmd, err := s.WithTx(tx).Get(ctx, businessID, cmdID)
		s.logger.InfoContext(ctx, "command", "cmd", cmd)
		if err != nil {
			s.logger.ErrorContext(ctx, "[PAYMENTS-EXECUTOR]-error while executing payment provider", "err", err.Error())
			return err
		}
		if cmd.Status == StatusSucceeded || cmd.Status == StatusFailed {
			s.logger.InfoContext(ctx, "[PAYMENTS]-payment already processed", "cmdID", cmd.ID.String(), "status", cmd.Status)
			return apperrors.ErrConflict.WithMessage("paymente already processed")
		}
		if cmd.Status == StatusPending {
			if err := s.WithTx(tx).ClaimPayment(ctx, businessID, cmdID); err != nil {
				s.logger.ErrorContext(ctx, "[PAYMENTS-EXECUTOR]-error while executing payment provider", "err", err.Error())
				return err
			}
			//fetch the updated paymentcmd 
			cmd, err = s.WithTx(tx).Get(ctx, businessID, cmdID)
			if err != nil {
				s.logger.ErrorContext(ctx, "[PAYMENTS-EXECUTOR]-error while executing payment provider", "err", err.Error())
				return err
			}
		}
		result, err := s.WithTx(tx).provider.ProcessPayment(ctx, *cmd)
		//debuggger
		s.logger.InfoContext(ctx, "checkpoint")
		s.logger.InfoContext(ctx, "callback_result", "result", result)
		if err != nil {
			s.logger.ErrorContext(ctx, "[PAYMENTS-EXECUTOR]-error while executing payment provider", "err", err.Error())
			raw, _ := json.Marshal(map[string]any{"error": err.Error()})
			markErr := s.MarkFailed(ctx, *cmd, "provider_error", err.Error(), raw)
			if markErr != nil {
				s.logger.ErrorContext(ctx, "[PAYMENTS]-failed to mark provider error", "cmdID", cmd.ID.String(), "err", markErr.Error())
				return markErr
			}
			return err
		}
		s.logger.InfoContext(ctx, "[PAYMENTS]-provider request accepted", "cmdID", cmd.ID.String(), "providerRequestID", result.RequestID)
		if result.Status == StatusSucceeded {
			err := s.WithTx(tx).MarkProviderAccepted(ctx, *cmd, result)
			if err != nil {
				return err
			}
			return s.WithTx(tx).MarkSucceeded(ctx, *cmd, result)
		}
		return s.WithTx(tx).MarkProviderAccepted(ctx, *cmd, result)
	})

	return err
}

func (s *Service) Get(ctx context.Context, businessID, id uuid.UUID) (*PaymentCommand, error) {
	return s.repo.Find(ctx, businessID, id)
}

func (s *Service) List(ctx context.Context, businessID uuid.UUID, page pagination.Page) ([]PaymentCommand, error) {
	return s.repo.List(ctx, businessID, page)
}

func (s *Service) ClaimPayment(ctx context.Context, businessID, cmdId uuid.UUID) error {

	err := s.repo.db.Transaction(func(tx *gorm.DB) error {

		paymentCmd, err := s.WithTx(tx).Get(ctx, businessID, cmdId)

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

func (s *Service) MarkProviderAccepted(ctx context.Context, cmd PaymentCommand, result ProviderResult) error {
	raw := result.Raw
	if len(raw) == 0 {
		raw, _ = json.Marshal(map[string]any{"requestId": result.RequestID, "receipt": result.Receipt})
	}

	if err := s.repo.MarkProviderAccepted(ctx, cmd.BusinessID, cmd.ID, result.RequestID, result.Receipt, raw); err != nil {
		s.logger.ErrorContext(ctx, "[PAYMENTS]-error while marking provider accepted", "err", err.Error(), "cmdID", cmd.ID.String())
		return err
	}
	return nil
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

		refCmd := cmd

		err := s.emitCommand(ctx, sqlTx, &refCmd, PaymentConfirmed, map[string]any{})
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
	
		//make a copy of the cmd
		refCmd := cmd

		err := s.emitCommand(ctx, sqlTx, &refCmd, PaymentFailed, map[string]any{})
		if err != nil {
			s.logger.ErrorContext(ctx, "[PAYMENTS]-error while emmiting event marking failed paymentCmd", "err", err.Error(), "cmdID", cmd.ID.String())

			return err
		}

		return nil

	})

	return err
}

func (s *Service) emitCommand(ctx context.Context, tx *sql.Tx, cmd *PaymentCommand, eventType PaymentEventType, extras map[string]any) error {
	if s.outbox == nil {
		return apperrors.ErrInternal.WithMessage("service outbox not available")
	}
	payload := map[string]any{
		"paymentID":  cmd.ID.String(),
		"businessID": cmd.BusinessID.String(),
		"orderID": 		cmd.OrderID.String(),
		"type":       cmd.Type,
		"amount":     cmd.Amount,
		"currency":   cmd.Currency,
		"phone":      cmd.Phone,
	}

	maps.Copy(payload, extras)

	err := s.emit(ctx, tx, cmd.BusinessID, cmd.ID, eventType, payload)
	if err != nil {
		return apperrors.ErrInternal.WithMessage("error while emmiting command")
	}
	return nil
}

type MpesaOperation interface {
	RegisterC2BURLs(ctx context.Context, req C2BRegisterRequest) (ProviderResult, error)
	TransactionStatus(ctx context.Context, req TransactionStatusRequest) (ProviderResult, error)
}

func (s *Service) RegisterMpesaC2BURLs(ctx context.Context, responseType string) (ProviderResult, error) {
	mpesa, ok := s.provider.(MpesaOperation)
	if !ok {
		return ProviderResult{}, apperrors.ErrInternal.WithMessage("mpesa provider not configured")
	}
	result, err := mpesa.RegisterC2BURLs(ctx, C2BRegisterRequest{ResponseType: responseType})
	if err != nil {
		s.logger.ErrorContext(ctx, "[PAYMENTS/MPESA]-c2b url registration failed", "err", err.Error())
		return ProviderResult{}, err
	}
	s.logger.InfoContext(ctx, "[PAYMENTS/MPESA]-c2b urls registered", "providerRequestID", result.RequestID)
	return result, nil
}

func (s *Service) QueryMpesaTransactionStatus(ctx context.Context, req TransactionStatusRequest) (ProviderResult, error) {
	mpesa, ok := s.provider.(MpesaOperation)
	if !ok {
		return ProviderResult{}, apperrors.ErrInternal.WithMessage("mpesa provider not configured")
	}
	result, err := mpesa.TransactionStatus(ctx, req)
	if err != nil {
		s.logger.ErrorContext(ctx, "[PAYMENTS/MPESA]-transaction status query failed", "transactionID", req.TransactionID, "err", err.Error())
		return ProviderResult{}, err
	}
	s.logger.InfoContext(ctx, "[PAYMENTS/MPESA]-transaction status query accepted", "transactionID", req.TransactionID, "providerRequestID", result.RequestID)
	return result, nil
}

func (s *Service) HandleMpesaCallback(ctx context.Context, raw json.RawMessage) error {
	var payload map[string]any
	if err := json.Unmarshal(raw, &payload); err != nil {
		return err
	}
	requestID := firstJSONString(payload, "Body.stkCallback.CheckoutRequestID", "Result.ConversationID", "Result.OriginatorConversationID", "CheckoutRequestID", "ConversationID", "OriginatorConversationID")
	receipt := firstJSONString(payload, "Body.stkCallback.CallbackMetadata.Item[MpesaReceiptNumber]", "Result.ResultParameters.ResultParameter[TransactionReceipt]", "TransID", "MpesaReceiptNumber")
	accountRef := firstJSONString(payload, "BillRefNumber", "Body.stkCallback.CallbackMetadata.Item[AccountReference]")
	resultCode := firstJSONString(payload, "Body.stkCallback.ResultCode", "Result.ResultCode", "ResultCode")
	resultDesc := firstJSONString(payload, "Body.stkCallback.ResultDesc", "Result.ResultDesc", "ResultDesc")

	cmd, err := s.repo.FindByProviderRequestID(ctx, requestID)
	if err != nil && accountRef != "" {
		cmd, err = s.repo.FindByAccountReference(ctx, accountRef)
	}
	if err != nil {
		s.logger.WarnContext(ctx, "[PAYMENTS/MPESA]-callback command not found", "providerRequestID", requestID, "accountReference", accountRef, "err", err.Error())
		return nil
	}

	if resultCode == "" || resultCode == "0" {
		return s.MarkSucceeded(ctx, *cmd, ProviderResult{RequestID: firstNonEmpty(requestID, cmd.ProviderRequestID), Receipt: firstNonEmpty(receipt, cmd.ProviderReceipt), Raw: raw, Status: StatusSucceeded})
	}
	return s.MarkFailed(ctx, *cmd, resultCode, firstNonEmpty(resultDesc, "mpesa payment failed"), raw)
}

func firstJSONString(payload map[string]any, paths ...string) string {
	for _, path := range paths {
		if value := lookupJSONValue(payload, path); value != "" {
			return value
		}
	}
	return ""
}

func lookupJSONValue(value any, path string) string {
	if path == "" {
		return ""
	}
	parts := strings.Split(path, ".")
	current := value
	for _, part := range parts {
		if strings.Contains(part, "[") && strings.HasSuffix(part, "]") {
			name := part[:strings.Index(part, "[")]
			key := strings.TrimSuffix(part[strings.Index(part, "[")+1:], "]")
			m, ok := current.(map[string]any)
			if !ok {
				return ""
			}
			items, ok := m[name].([]any)
			if !ok {
				return ""
			}
			current = ""
			for _, item := range items {
				im, ok := item.(map[string]any)
				if !ok {
					continue
				}
				if im["Name"] == key {
					current = im["Value"]
					break
				}
			}
			continue
		}
		m, ok := current.(map[string]any)
		if !ok {
			return ""
		}
		current = m[part]
	}
	switch v := current.(type) {
	case string:
		return v
	case float64:
		return strconv.FormatInt(int64(v), 10)
	case json.Number:
		return v.String()
	default:
		return ""
	}
}
