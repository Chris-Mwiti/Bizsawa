package orders

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/Codecx-Org/FinAI/backend/internal/customers"
	"github.com/Codecx-Org/FinAI/backend/internal/inventory"
	"github.com/Codecx-Org/FinAI/backend/internal/invoices"
	"github.com/Codecx-Org/FinAI/backend/internal/sales"
	shareddb "github.com/Codecx-Org/FinAI/backend/internal/shared/db"
	apperrors "github.com/Codecx-Org/FinAI/backend/internal/shared/errors"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/middleware"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/pagination"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

type OrderEventType string

const (
	OrderConfirmed OrderEventType = "order.confirmed"
	OrderCancelled OrderEventType = "order.cancelled"
	OrderRefund    OrderEventType = "order.refund"
	OrderFulfilled OrderEventType = "order.fulfilled" 
	OrderPaymentInit OrderEventType = "order.payment.init"
)

type CommandType string
const (
	CommandSTKPush CommandType = "stk_push"
	CommandB2C     CommandType = "b2c"
	CommandC2B     CommandType = "c2b"
	CommandCash    CommandType = "cash"
)


type OrderPayInitReq struct {
	Type             CommandType     `json:"type"`
	Amount           decimal.Decimal `json:"amount"`
	OrderID 				 string						`json:"orderID"`
	Currency         string          `json:"currency"`
	Phone            string          `json:"phone"`
	AccountReference string          `json:"accountReference"`
	Provider				 string           `json:"provider"`
	Payload          map[string]any  `json:"payload"`
}


type Service struct {
	repo      *Repository
	inventory *inventory.Service
	sales     *sales.Service
	invoices *invoices.Service
	customers *customers.Service
	payments OrderPaymentInterface
	logger 		*slog.Logger
	outbox		*river.Client[*sql.Tx]    
}


func NewService(repo *Repository, inventory *inventory.Service, sales *sales.Service, outboxRepo *river.Client[*sql.Tx], logger *slog.Logger, invoices *invoices.Service, customers *customers.Service, payments OrderPaymentInterface) *Service {
	if logger == nil {
		logger = slog.Default()
	}
	return &Service{repo: repo, inventory: inventory, sales: sales, outbox: outboxRepo, invoices: invoices, customers: customers, payments: payments, logger: logger}
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
		repo:      s.repo.WithTx(tx),
		inventory: s.inventory,
		sales:     s.sales,
		invoices:  s.invoices,
		customers: s.customers,
		payments:  s.payments,
		outbox:    s.outbox,
		logger:    s.logger,
	}

}

func (s *Service) Create(ctx context.Context, businessID uuid.UUID, req CreateOrderRequest) (*Order, error) {
	key, _ := middleware.IdempotencyKeyFromCtx(ctx)
	if key != "" {
		if existing, err := s.repo.FindByIdempotency(ctx, businessID, key); err == nil {
			return existing, nil
		}
	} else {
		s.logger.DebugContext(ctx, "[ORDERS]-request without IdempotencyKey", "businessID", businessID.String())
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
		s.logger.ErrorContext(ctx, "[ORDERS]-could not create order", "err", err.Error(), "businessID", businessID.String())
		return nil, apperrors.ErrInternal.WithCause(err).WithMessage("error while creating order")
	}
	s.logger.InfoContext(ctx, "[ORDERS]-order created", "orderID", order.ID.String(), "businessID", order.BusinessID.String())

	order, err := s.repo.Find(ctx, businessID, order.ID)
	if err != nil {

		if errors.Is(err, gorm.ErrRecordNotFound) {
			s.logger.InfoContext(ctx, "[ORDERS]-order not found", "orderID", order.ID.String(), "businessID", order.BusinessID.String())
			return nil, apperrors.ErrNotFound.WithMessage("order not found")
		}

		s.logger.ErrorContext(ctx, "[ORDERS]-could not fetch orders", "err", err.Error())
	}

	s.logger.DebugContext(ctx, "[ORDERS]-order found", "orderID", order.ID, "businessID", order.BusinessID.String())

	return order, nil
}

func (s *Service) List(ctx context.Context, businessID uuid.UUID, page pagination.Page) ([]Order, error) {
	orders, err := s.repo.List(ctx, businessID, page)
	
	if err != nil {
		s.logger.ErrorContext(ctx, "[ORDERS]-could not fetch orders", "err", err.Error(), "businessID", businessID.String())
		return nil, apperrors.ErrInternal.WithMessage("could not fetch orders")
	}

	return orders, nil
}

func (s *Service) Get(ctx context.Context, businessID, orderID uuid.UUID) (*Order, error) {
	order, err := s.repo.Find(ctx, businessID, orderID)
	if err != nil {

		if errors.Is(err, gorm.ErrRecordNotFound) {
			s.logger.DebugContext(ctx, "[ORDERS]-order not found", "orderID", order.ID.String(), "businessID", order.BusinessID.String())
			return nil, apperrors.ErrNotFound.WithMessage("order not found")
		}

		s.logger.ErrorContext(ctx, "[ORDERS]-could not fetch orders", "err", err.Error(), "businessID", businessID.String(), "orderID", orderID.String())
	}

	s.logger.DebugContext(ctx, "[ORDERS]-order found", "orderID", order.ID.String(), "businessID", order.BusinessID.String())

	return order, nil
}

func (s *Service) FindOrderByUpdate(ctx context.Context, businessID, orderID uuid.UUID) (*Order, error) {

	order, err := s.repo.FindOrderByUpdate(ctx, businessID, orderID)
	
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			s.logger.DebugContext(ctx, "[ORDERS]-order not found", "orderID", order.ID, "businessID", order.BusinessID.String())
			return nil, apperrors.ErrNotFound.WithMessage("order not found")
		}

		s.logger.ErrorContext(ctx, "[ORDERS]-could not fetch order", "err", err.Error(), "businessID", businessID.String())
		return nil, apperrors.ErrInternal.WithCause(err).WithMessage("err while processing order request")
	}

	return order, nil

}

func (s *Service) PaymentUpdate(ctx context.Context, businessID, orderID uuid.UUID, status PaymentStatus) (error) {
	err := s.repo.db.Transaction(func(tx *gorm.DB) error {
		order, err := s.repo.WithTx(tx).FindOrderByUpdate(ctx, businessID, orderID);
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				s.logger.DebugContext(ctx, "[ORDERS]-order not found", "orderID", order.ID.String(), "businessID", order.BusinessID.String())
				return apperrors.ErrNotFound.WithMessage("order not found")
			}

			s.logger.ErrorContext(ctx, "[ORDERS]-could not fetch order", "err", err.Error(), "businessID", businessID.String())
			return apperrors.ErrInternal.WithCause(err).WithMessage("err while processing order request")
		}


		if order.Status == StatusConfirmed || order.Status == StatusFulfilled {
			s.logger.InfoContext(ctx, "[ORDERS]-order confirmation retry with diff IdempotencyKey", "businessID",businessID.String(), "orderID", orderID.String())
			return apperrors.ErrConflict.WithMessage("this order has already been completed by another request")
		}

		order.PaymentStatus = status

		//save the order
		if err := s.repo.WithTx(tx).Update(ctx, order); err != nil {
			s.logger.ErrorContext(ctx, "[ORDERS]-could not update order", "businessID", businessID.String(), "orderID", orderID.String())
			return err
		}
	
		return nil
	})

	return err
}

func (s *Service) Confirm(ctx context.Context, businessID, orderID, key uuid.UUID, customerPhone string) (*Order, error) {
	
	var order *Order

	//create a transaction that updates the following: invoices, payments
	err := s.repo.db.Transaction(func(tx *gorm.DB) error {
		//fetch the roder
		var err error
		order, err = s.repo.WithTx(tx).FindOrderByUpdate(ctx, businessID, orderID);
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				s.logger.DebugContext(ctx, "[ORDERS]-order not found", "orderID", order.ID.String(), "businessID", order.BusinessID.String())
				return apperrors.ErrNotFound.WithMessage("order not found")
			}

			s.logger.ErrorContext(ctx, "[ORDERS]-could not fetch order", "err", err.Error(), "businessID", businessID.String())
			return apperrors.ErrInternal.WithCause(err).WithMessage("err while processing order request")
		}


		if order.Status == StatusConfirmed || order.Status == StatusFulfilled {

			//check if the its the same client making the request through IdempotencyKey
			if order.IdempotencyKey == key.String(){
				return nil
			}

			s.logger.InfoContext(ctx, "[ORDERS]-order confirmation retry with diff IdempotencyKey", "businessID",businessID.String(), "orderID", orderID.String())
			return apperrors.ErrConflict.WithMessage("this order has already been completed by another request")
		}
		

		sm := s.buildOrderMachine(businessID, order)

		if err := sm.FireCtx(ctx, TriggerConfirm); err != nil {
			s.logger.DebugContext(ctx, "[ORDERS]-state transition denied", "orderID", orderID.String())
			return apperrors.ErrConflict.WithMessage("order cannot confirmed from its state")
		}

		order.Status = StatusConfirmed

		//save the order
		if err := s.repo.WithTx(tx).Update(ctx, order); err != nil {
			s.logger.ErrorContext(ctx, "[ORDERS]-could not update order", "businessID", businessID.String(), "orderID", orderID.String())
			return err
		}

		invoice, err := s.invoices.WithTx(tx).CreateInvoice(ctx, businessID, buildInvoicePayload(order))
		if err != nil {
			s.logger.ErrorContext(ctx, "[ORDERS]-order", "order", order)
			s.logger.ErrorContext(ctx, "[ORDER/INVOICES]-could not create invoice", "businessID", businessID.String(), "orderID", orderID.String(), "err", err.Error())
			return apperrors.ErrInternal.WithMessage("could not create invoice from order")
		}
		s.logger.InfoContext(ctx, "[ORDER/INVOICES]-invoice created by orderID", "businessID", businessID.String(), "invoiceID", invoice.ID.String(), "orderID", order.ID.String())

		inventoryLines := make([]inventory.DecrementLine, 0, len(order.Lines))

		for _, line := range order.Lines{
			inventoryLines = append(inventoryLines, inventory.DecrementLine{
        ProductID: line.ProductID,
				Quantity: line.Quantity,
			})
		}
		
		if err := s.inventory.WithTx(tx).DecrementForOrder(ctx, businessID, order.ID, inventoryLines); err != nil {
			s.logger.ErrorContext(ctx, "[ORDER/INVENTORY]-could not decrement inventory", "businessID", businessID.String(), "orderID", orderID.String(), "err", err.Error())
			return apperrors.ErrInternal.WithMessage("could not decrement inventory")
		}

		
		sqlTx, ok := tx.Statement.ConnPool.(*sql.Tx)
		if !ok {
			s.logger.ErrorContext(ctx, "[ORDERS]-error while initializing sql tx conn pool", "businessID", businessID.String(), "orderID", orderID.String(), "err", errors.New("sqlTx initialization failed"))
			return fmt.Errorf("sqlTx not acceptable: received of type: %v", sqlTx)
		}

		rawPayReq := buildPaymentPayload(order, customerPhone) 
		payReqByte, err := json.Marshal(rawPayReq)
		if err != nil {
			s.logger.ErrorContext(ctx, "[ORDERS/PAYMENTS]-error while marshalling req")
			return err
		}

		var result map[string]any
		if err := json.Unmarshal(payReqByte, &result); err != nil {
			s.logger.ErrorContext(ctx, "[ORDERS/PAYMENTS]-error while unmarshaling req")
			return err
		}


		//emit an event that says the order has been confirmed
		if err := s.emit(ctx, sqlTx,businessID, orderID, key,OrderPaymentInit, result); err != nil {
			s.logger.ErrorContext(ctx, "[ORDER/OUTBOX]-could not emit order created event", "businessID", businessID.String(), "orderID", orderID.String(), "err", err.Error())
			return apperrors.ErrInternal.WithMessage("error while emitting event")
		} 	
		
		//emit an event that says the order has been confirmed
		if err := s.emit(ctx, sqlTx,businessID, orderID, key,OrderConfirmed, map[string]any{"amount": order.Total, "invoiceID": invoice.ID.String()}); err != nil {
			s.logger.ErrorContext(ctx, "[ORDER/OUTBOX]-could not emit order created event", "businessID", businessID.String(), "orderID", orderID.String(), "err", err.Error())
			return apperrors.ErrInternal.WithMessage("error while emitting event")
		} 	
	
		return nil
	})

	if err != nil {
		return nil, err 
	}
		
	return order, nil
}

// FulfillOrder processes the order fulfillment within a safe database transaction block
func (s *Service) FulfillOrder(ctx context.Context, businessID, orderID, staffID uuid.UUID) (*Order, error) {
	var order *Order

	key, ok := middleware.IdempotencyKeyFromCtx(ctx)

	if !ok {
		return nil, apperrors.ErrConflict.WithMessage("IdempotencyKeyFromCtx is missing")
	}

	// 1. Wrap the entire workflow inside a single database transaction
	err := s.repo.db.Transaction(func(tx *gorm.DB) error {
		var err error
		
		// 2. Fetch the order attached to the current transaction context
		order, err = s.repo.WithTx(tx).FindOrderByUpdate(ctx, businessID, orderID)
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
		// 7. Update internal order state
		now := time.Now().UTC()
		order.FulfilledAt = &now
		order.Status = StatusFulfilled

		// 8. Save the final order state back to the database
		if err := s.repo.WithTx(tx).Update(ctx, order); err != nil {
			return fmt.Errorf("failed to save order state: %w", err)
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

		sqlTx, ok := tx.Statement.ConnPool.(*sql.Tx)
		if !ok {
			s.logger.ErrorContext(ctx, "[ORDERS]-error while initializing sql tx conn pool", "businessID", businessID.String(), "orderID", orderID.String(), "err", err.Error())
			return fmt.Errorf("sqlTx not acceptable: received of type: %v", sqlTx)
		}


		parsedKey, err := uuid.Parse(key)
		if err != nil {
			return err
		}


		err = s.emit(ctx, sqlTx, businessID, orderID, parsedKey,OrderFulfilled, map[string]any{"amount": order.Total})

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
		order, err := s.repo.FindOrderByUpdate(ctx, businessID, orderID)

		if err != nil {
			return err
		}

		sm := s.buildOrderMachine(businessID, order)

		if err := sm.FireCtx(ctx, TriggerCancel); err != nil {
			return apperrors.ErrConflict.WithMessage("order state transition not supported")
		}

		//cancel the invoice of the order
		orderInvoices, err := s.invoices.WithTx(tx).GetInvoiceByOrderID(ctx, businessID, orderID, pagination.Page{
			Limit: 1,
		})

		if err != nil {
			s.logger.ErrorContext(ctx, "[ORDERS/INVOICES]-error while fetching order invoices", "businessID", businessID.String(), "orderID", orderID.String(), "err", err.Error())
			return err
		}

		if len(orderInvoices) > 0 {
			//get the latest invoice
			invoice := orderInvoices[0]
			_, err := s.invoices.WithTx(tx).Cancel(ctx,businessID,invoice.ID)

			if err != nil {
				s.logger.ErrorContext(ctx, "[ORDERS/INVOICES]-error while fetching order invoices", "businessID", businessID.String(), "orderID", orderID.String(), "err", err.Error())
				return err
			}
		}
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


