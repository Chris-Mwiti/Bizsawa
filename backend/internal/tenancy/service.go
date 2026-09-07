package tenancy

import (
	"context"
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"

	apperrors "github.com/Codecx-Org/FinAI/backend/internal/shared/errors"
)

type Service struct {
	repo  *Repository
	stk   SubscriptionSTKProvider
}

type SubscriptionSTKProvider interface {
	STKPush(ctx context.Context, phone string, amount decimal.Decimal, accountRef string) (checkoutID string, raw json.RawMessage, err error)
}

func NewService(repo *Repository) *Service { return &Service{repo: repo} }

func (s *Service) SetSTKProvider(p SubscriptionSTKProvider) { s.stk = p }

func (s *Service) TriggerSTKIfConfigured(ctx context.Context, paymentID uuid.UUID) error {
	if s.stk == nil {
		return nil
	}
	p, err := s.repo.FindSubscriptionPaymentByID(ctx, paymentID)
	if err != nil {
		return err
	}
	if p.Status != "pending" {
		return nil
	}
	amt, _ := decimal.NewFromString(p.Amount)
	checkoutID, raw, err := s.stk.STKPush(ctx, p.Phone, amt, p.AccountReference)
	if err != nil {
		p.Status = "failed"
		p.FailureCode = "stk_failed"
		p.FailureMessage = err.Error()
		_ = s.repo.UpdateSubscriptionPayment(ctx, p)
		return err
	}
	p.CheckoutRequestID = checkoutID
	p.Status = "processing"
	p.ResultPayload = string(raw)
	return s.repo.UpdateSubscriptionPayment(ctx, p)
}

func (s *Service) EnsureDefaultSubscription(ctx context.Context, userID uuid.UUID) (*Subscription, error) {
	sub, err := s.repo.ActiveByUser(ctx, userID)
	if err == nil {
		return sub, nil
	}

	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	sub = &Subscription{UserID: userID, PlanCode: PlanFree, Status: "ACTIVE"}
	if err := s.repo.Create(ctx, sub); err != nil {
		return nil, err
	}

	return sub, nil
}

func (s *Service) EnforceBusinessLimit(ctx context.Context, userID uuid.UUID) error {
	sub, err := s.EnsureDefaultSubscription(ctx, userID)
	if err != nil {
		return err
	}

	plan := PlanByCode(sub.PlanCode)
	if plan.MaxBusinesses == 0 {
		return nil
	}

	count, err := s.repo.CountBusinessesByOwner(ctx, userID)
	if err != nil {
		return err
	}

	if count >= int64(plan.MaxBusinesses) {
		return apperrors.ErrBusinessLimitReached.WithMessage("business limit reached for subscription plan")
	}

	return nil
}

// IsPremium returns true if user has active premium/enterprise.
func (s *Service) IsPremium(ctx context.Context, userID uuid.UUID) (bool, *Subscription) {
	sub, err := s.repo.ActiveByUser(ctx, userID)
	if err != nil {
		return false, nil
	}
	if sub.PlanCode == PlanPremium || sub.PlanCode == PlanEnterprise {
		if sub.EndsAt != nil && sub.EndsAt.Before(time.Now()) {
			return false, sub
		}
		return true, sub
	}
	return false, sub
}

type InitiateUpgradeRequest struct {
	PlanCode PlanCode `json:"planCode"`
	Phone    string   `json:"phone"`
}

func (s *Service) InitiateUpgrade(ctx context.Context, userID uuid.UUID, req InitiateUpgradeRequest, idempotencyKey string) (*SubscriptionPayment, error) {
	if req.PlanCode != PlanPremium && req.PlanCode != PlanEnterprise {
		req.PlanCode = PlanPremium
	}
	phone := strings.TrimSpace(req.Phone)
	if phone == "" {
		return nil, apperrors.ErrUnprocessable.WithMessage("phone is required for M-Pesa STK push")
	}
	if idempotencyKey == "" {
		return nil, apperrors.ErrUnprocessable.WithMessage("idempotency key required")
	}
	if existing, err := s.repo.FindSubscriptionPaymentByIdempotency(ctx, idempotencyKey); err == nil {
		return existing, nil
	}
	price := PriceForPlan(req.PlanCode)
	amt, _ := decimal.NewFromString(price)
	_ = amt
	p := &SubscriptionPayment{
		UserID:           userID,
		PlanCode:         req.PlanCode,
		Amount:           price,
		Currency:         "KES",
		Phone:            phone,
		Status:           "pending",
		IdempotencyKey:   idempotencyKey,
		AccountReference: userID.String() + ":" + string(req.PlanCode),
		Payload:          "{}",
	}
	if err := s.repo.CreateSubscriptionPayment(ctx, p); err != nil {
		return nil, err
	}
	return p, nil
}

func (s *Service) MarkSubscriptionPaymentProcessing(ctx context.Context, id uuid.UUID, checkoutID string) error {
	p, err := s.repo.FindSubscriptionPaymentByID(ctx, id)
	if err != nil {
		return err
	}
	p.CheckoutRequestID = checkoutID
	p.Status = "processing"
	return s.repo.UpdateSubscriptionPayment(ctx, p)
}

func (s *Service) GetSubscriptionPayment(ctx context.Context, id uuid.UUID, userID uuid.UUID) (*SubscriptionPayment, error) {
	p, err := s.repo.FindSubscriptionPaymentByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if p.UserID != userID {
		return nil, apperrors.ErrForbidden.WithMessage("not your payment")
	}
	return p, nil
}

func (s *Service) HandleSubscriptionCallback(ctx context.Context, raw json.RawMessage) error {
	var payload map[string]any
	if err := json.Unmarshal(raw, &payload); err != nil {
		return err
	}
	requestID := firstJSONString(payload, "Body.stkCallback.CheckoutRequestID", "Result.ConversationID", "CheckoutRequestID")
	receipt := firstJSONString(payload, "Body.stkCallback.CallbackMetadata.Item[MpesaReceiptNumber]", "TransID", "MpesaReceiptNumber")
	resultCode := firstJSONString(payload, "Body.stkCallback.ResultCode", "Result.ResultCode", "ResultCode")
	resultDesc := firstJSONString(payload, "Body.stkCallback.ResultDesc", "Result.ResultDesc", "ResultDesc")
	accountRef := firstJSONString(payload, "BillRefNumber", "Body.stkCallback.CallbackMetadata.Item[AccountReference]")

	var p *SubscriptionPayment
	var err error
	if requestID != "" {
		p, err = s.repo.FindSubscriptionPaymentByCheckout(ctx, requestID)
	}
	if (err != nil || p == nil) && accountRef != "" {
		// fallback not implemented — require checkout ID
		return apperrors.ErrNotFound.WithMessage("subscription payment not found")
	}
	if p == nil {
		return apperrors.ErrNotFound.WithMessage("subscription payment not found")
	}
	rawStr := string(raw)
	if resultCode == "" || resultCode == "0" {
		p.Status = "succeeded"
		p.ProviderReceipt = receipt
		if p.CheckoutRequestID == "" {
			p.CheckoutRequestID = requestID
		}
		p.ResultPayload = rawStr
		if err := s.repo.UpdateSubscriptionPayment(ctx, p); err != nil {
			return err
		}
		// upgrade subscription to premium for 30 days
		ends := time.Now().AddDate(0, 1, 0)
		_, err = s.repo.UpsertActiveSubscription(ctx, p.UserID, p.PlanCode, &ends)
		return err
	}
	p.Status = "failed"
	p.FailureCode = resultCode
	p.FailureMessage = resultDesc
	p.ResultPayload = rawStr
	return s.repo.UpdateSubscriptionPayment(ctx, p)
}

func firstJSONString(payload map[string]any, paths ...string) string {
	for _, path := range paths {
		if v := lookupJSONValue(payload, path); v != "" {
			return v
		}
	}
	return ""
}

func lookupJSONValue(value any, path string) string {
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
