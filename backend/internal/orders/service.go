package orders

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"time"

	"github.com/Codecx-Org/FinAI/backend/internal/customers"
	"github.com/Codecx-Org/FinAI/backend/internal/inventory"
	"github.com/Codecx-Org/FinAI/backend/internal/invoices"
	"github.com/Codecx-Org/FinAI/backend/internal/payments"
	"github.com/Codecx-Org/FinAI/backend/internal/sales"
	shareddb "github.com/Codecx-Org/FinAI/backend/internal/shared/db"
	apperrors "github.com/Codecx-Org/FinAI/backend/internal/shared/errors"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/middleware"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/outbox"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/pagination"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

type OrderEventType string

const (
	OrderConfirmed OrderEventType = "order.confirmed"
	OrderCancelled OrderEventType = "order.cancelled"
	OrderRefund    OrderEventType = "order.refund"
	OrderFulfilled OrderEventType = "order.fulfilled" 
)


type Service struct {
	repo      *Repository
	inventory *inventory.Service
	sales     *sales.Service
	invoices *invoices.Service
	payment		*payments.Service
	customers *customers.Service
	outbox    outbox.Repository
}


func NewService(repo *Repository, inventory *inventory.Service, sales *sales.Service, outboxRepo outbox.Repository, invoices *invoices.Service, payment *payments.Service, customers *customers.Service) *Service {
	//@todo: here you will right instances of the order machine
	return &Service{repo: repo, inventory: inventory, sales: sales, outbox: outboxRepo, invoices: invoices, payment: payment, customers: customers}
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

type ConfirmOrderRequest struct {
	CustomerPhone string  `json:"customerPhone"`
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

	//@TODO: In the future when it works out aggregate this multiple database calls into a single database query
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

func (s *Service) Confirm(ctx context.Context, businessID, orderID, key uuid.UUID, customerPhone string) (*Order, error) {
	
	var order *Order

	//create a transaction that updates the following: invoices, payments
	err := s.repo.db.Transaction(func(tx *gorm.DB) error {
		//fetch the roder
		var err error
		order, err = s.repo.WithTx(tx).Find(ctx, businessID, orderID);
		if err != nil {
			return err
		}

		if order.Status == StatusConfirmed || order.Status == StatusFulfilled {

			//check if the its the same client making the request through IdempotencyKey
			if order.IdempotencyKey == key.String(){
				return nil
			}

			return apperrors.ErrConflict.WithMessage("this order has already been completed by another request")
		}
		

		sm := s.buildOrderMachine(businessID, order)

		if err := sm.FireCtx(ctx, TriggerConfirm); err != nil {
			return apperrors.ErrConflict.WithMessage("order cannot confirmed from its state")
		}

		_, err = s.invoices.WithTx(tx).CreateInvoice(ctx, businessID, buildInvoicePayload(order))
		if err != nil {
			return err
		}

		inventoryLines := make([]inventory.DecrementLine, 0, len(order.Lines))

		for _, line := range order.Lines{
			inventoryLines = append(inventoryLines, inventory.DecrementLine{
        ProductID: line.ProductID,
				Quantity: line.Quantity,
			})
		}
		if err := s.inventory.WithTx(tx).DecrementForOrder(ctx, businessID, order.ID, inventoryLines); err != nil {
			return err
		}


		//save the order
		if err := s.repo.WithTx(tx).Update(ctx, order); err != nil {
			return err
		}

		if err != nil {
			return err
		}

		//emit an event that says the order has been confirmed
		return s.emit(ctx, tx,businessID, orderID, OrderConfirmed, map[string]any{"amount": order.Total}) 	
	})

	if err != nil {
		return nil, err
	}

	
	return s.repo.Find(ctx, businessID, order.ID)
}

// FulfillOrder processes the order fulfillment within a safe database transaction block
func (s *Service) FulfillOrder(ctx context.Context, businessID, orderID, staffID uuid.UUID) (*Order, error) {
	var order *Order

	// 1. Wrap the entire workflow inside a single database transaction
	err := s.repo.db.Transaction(func(tx *gorm.DB) error {
		var err error
		
		// 2. Fetch the order attached to the current transaction context
		order, err = s.repo.WithTx(tx).Find(ctx, businessID, orderID)
		if err != nil {
			return err
		}

		// 3. IDEMPOTENCY CHECK: Short-circuit with success if already fulfilled
		if order.Status == StatusFulfilled {
			return nil
		}

		// 4. STATE MACHINE VALIDATION: Let the pure traffic cop validate the path
		sm := s.buildOrderMachine(businessID,order)
		if err := sm.Fire(TriggerFullfill); err != nil {
			return fmt.Errorf("invalid state transition: %w", err)
		}

		// 5. Map the domain payload cleanly using our pure helper
		saleLines := buildSalesPayload(order)

		// 6. Cross-Module Transactional Write
		if s.sales != nil {
			_, err = s.sales.WithTx(tx).CreateFromOrder(
				ctx, 
				businessID, 
				staffID, // Statically typed parameter, no more generic args runtime reflection!
				order.ID, 
				order.CustomerID, 
				order.PaymentMethod, 
				saleLines,
			)
			if err != nil {
				return fmt.Errorf("failed to record sale record: %w", err)
			}
		}

		// 7. Update internal order state
		now := time.Now().UTC()
		order.FulfilledAt = &now

		// 8. Save the final order state back to the database
		if err := s.repo.WithTx(tx).Update(ctx, order); err != nil {
			return fmt.Errorf("failed to save order state: %w", err)
		}

		err = s.emit(ctx, tx, businessID, orderID, OrderFulfilled, map[string]any{"amount": order.Total})

		if err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	return order, nil
}

func (s *Service) Cancel(ctx context.Context, businessID, orderID uuid.UUID) error {
	
	err := s.repo.db.Transaction(func(tx *gorm.DB) error {

		//fetch the order
		order, err := s.repo.Find(ctx, businessID, orderID)

		if err != nil {
			return err
		}

		sm := s.buildOrderMachine(businessID, order)

		if err := sm.FireCtx(ctx, TriggerCancel); err != nil {
			return err
		}

		//cancel the invoice of the order
		
 
		return nil
	})

	if err != nil {
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

func (s *Service) emit(ctx context.Context, tx *gorm.DB, businessID, orderID uuid.UUID, eventType OrderEventType, extras map[string]any) (error){
	if s.outbox == nil {
		return apperrors.ErrInternal.WithCause(errors.New("outbox repository is missing"))
	}

	payload := map[string]any{
		"orderId": orderID,
		"businessID": businessID,
	}

	maps.Copy(payload, extras)

	jsonPayload, _ := json.Marshal(payload)

	err := s.outbox.WithTx(tx).Insert(ctx, &outbox.Event{TenantID: businessID, AggregateID: orderID.String(), AggregateType: "order", EventType: string(eventType), Stream: "orders", Payload: jsonPayload})

	if err != nil {
		return apperrors.ErrInternal.WithCause(err)
	}

	return nil
}
