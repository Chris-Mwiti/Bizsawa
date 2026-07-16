package orders

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/Codecx-Org/FinAI/backend/internal/inventory"
	"github.com/Codecx-Org/FinAI/backend/internal/sales"
	shareddb "github.com/Codecx-Org/FinAI/backend/internal/shared/db"
	apperrors "github.com/Codecx-Org/FinAI/backend/internal/shared/errors"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/middleware"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/outbox"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/pagination"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

type InventoryWriter interface {
	DecrementForOrder(ctx context.Context, businessID, orderID uuid.UUID, lines []inventory.DecrementLine) error
}
type SaleCreator interface {
	CreateFromOrder(ctx context.Context, businessID, staffID, orderID uuid.UUID, customerID *uuid.UUID, paymentMethod string, lines []sales.OrderLineInput) (*sales.Sale, error)
}
type Service struct {
	repo      *Repository
	inventory InventoryWriter
	sales     SaleCreator
	outbox    outbox.Repository
}


func NewService(repo *Repository, inventory InventoryWriter, sales SaleCreator, outboxRepo outbox.Repository) *Service {
	//@todo: here you will right instances of the order machine
	return &Service{repo: repo, inventory: inventory, sales: sales, outbox: outboxRepo}
}

type OrderLineRequest struct {
	ProductID uuid.UUID       `json:"productId"`
	Quantity  decimal.Decimal `json:"quantity"`
	UnitPrice decimal.Decimal `json:"unitPrice"`
}
type CreateOrderRequest struct {
	CustomerID    *uuid.UUID         `json:"customerId"`
	PaymentMethod string             `json:"paymentMethod"`
	Lines         []OrderLineRequest `json:"lines"`
}

func (s *Service) Create(ctx context.Context, businessID uuid.UUID, req CreateOrderRequest) (*Order, error) {
	key, _ := middleware.IdempotencyKeyFromCtx(ctx)
	if key != "" {
		if existing, err := s.repo.FindByIdempotency(ctx, businessID, key); err == nil {
			return existing, nil
		}
	} else {
		return nil, apperrors.ErrForbidden.WithCause(errors.New("IdempotencyKey not provided"))
	}
	if len(req.Lines) == 0 {
		return nil, apperrors.ErrUnprocessable.WithMessage("order requires at least one line")
	}
	subtotal := decimal.Zero
	lines := make([]OrderLine, 0, len(req.Lines))

	for _, line := range req.Lines {
		total := line.Quantity.Mul(line.UnitPrice).Round(2)
		subtotal = subtotal.Add(total)
		lines = append(lines, OrderLine{BaseModel: shareddb.BaseModel{TenantID: businessID}, BusinessID: businessID, ProductID: line.ProductID, Quantity: line.Quantity, UnitPrice: line.UnitPrice, LineTotal: total})
	}

	tax := subtotal.Mul(decimal.NewFromFloat(0.16)).Round(2)
	pay := req.PaymentMethod
	if pay == "" {
		pay = "cash"
	}
	order := &Order{BaseModel: shareddb.BaseModel{TenantID: businessID}, BusinessID: businessID, CustomerID: req.CustomerID, Status: StatusDraft, Subtotal: subtotal, TaxAmount: tax, Total: subtotal.Add(tax), PaymentMethod: pay, IdempotencyKey: key}

	if err := s.repo.Create(ctx, order, lines); err != nil {
		return nil, err
	}
	return s.repo.Find(ctx, businessID, order.ID)
}
func (s *Service) List(ctx context.Context, businessID uuid.UUID, page pagination.Page) ([]Order, error) {
	return s.repo.List(ctx, businessID, page)
}
func (s *Service) Get(ctx context.Context, businessID, orderID uuid.UUID) (*Order, error) {
	return s.repo.Find(ctx, businessID, orderID)
}
func (s *Service) Confirm(ctx context.Context, businessID, orderID uuid.UUID) (*Order, error) {
	order, err := s.repo.Find(ctx, businessID, orderID)
	if err != nil {
		return nil, err
	}

	if order.Status == StatusConfirmed || order.Status == StatusFulfilled {
		return order, nil
	}
	if order.Status != StatusDraft {
		return nil, apperrors.ErrConflict.WithMessage("order cannot be confirmed from current status")
	}

	sm := s.buildOrderMachine(businessID, order)
	if err := sm.FireCtx(ctx, TriggerConfirm); err != nil {
		return nil, err
	}

	return s.repo.Find(ctx, businessID, order.ID)
}

func (s *Service) Fulfill(ctx context.Context, businessID, staffID, orderID uuid.UUID) (*Order, error) {
	order, err := s.repo.Find(ctx, businessID, orderID)
	if err != nil {
		return nil, err
	}

	sm := s.buildOrderMachine(businessID, order);
	 
	if order.Status == StatusDraft {
		if err := sm.FireCtx(ctx, TriggerConfirm); err != nil {
			return nil, err
		}
	}


	if err := sm.FireCtx(ctx, TriggerFullfill, staffID); err != nil {
		return nil, err
	}

	return s.repo.Find(ctx, businessID, order.ID)
}

func (s *Service) Cancel(ctx context.Context, businessID, orderID uuid.UUID) error {
	order, err := s.repo.Find(ctx, businessID, orderID)
	
	if err != nil {
		return err
	}

	sm := s.buildOrderMachine(businessID, order)

	if err := sm.FireCtx(ctx, TriggerCancel); err != nil {
		return err
	}

	return nil
}

func (s *Service) Refund(ctx context.Context, businessID, orderID uuid.UUID) error {
	order, err := s.repo.Find(ctx, businessID, orderID)
	if err != nil {
		return err
	}

	sm := s.buildOrderMachine(businessID, order)

	if err := sm.FireCtx(ctx, TriggerRequestRefund); err != nil {
		return nil
	}

	return nil
}

func (s *Service) emit(ctx context.Context, businessID, orderID uuid.UUID, eventType string) (error){
	if s.outbox == nil {
		return apperrors.ErrInternal.WithCause(errors.New("outbox repository is missing"))
	}
	payload, _ := json.Marshal(map[string]any{"orderId": orderID, "businessId": businessID})
	err := s.outbox.Insert(ctx, &outbox.Event{TenantID: businessID, AggregateID: orderID.String(), AggregateType: "order", EventType: eventType, Stream: "orders", Payload: payload})

	if err != nil {
		return apperrors.ErrInternal.WithCause(err)
	}

	return nil
}
