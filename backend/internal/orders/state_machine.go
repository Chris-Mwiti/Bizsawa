package orders

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/Codecx-Org/FinAI/backend/internal/inventory"
	"github.com/Codecx-Org/FinAI/backend/internal/invoices"
	"github.com/Codecx-Org/FinAI/backend/internal/payments"
	"github.com/Codecx-Org/FinAI/backend/internal/sales"
	"github.com/google/uuid"
	"github.com/qmuntal/stateless"
)

type OrderTrigger string

const (
	TriggerConfirm  OrderTrigger = "order_confirm" // draft -> complete
	TriggerFailed OrderTrigger = "order_failed" //complete/draft -> canceled
	TriggerFullfill OrderTrigger = "order_fullfiled" //complete -> fullfilled
	TriggerRequestRefund OrderTrigger = "order_refund" //fullfiled -> refund
	TriggerCancel OrderTrigger = "order_cancel" //draft -> cancelled
)

func (s *Service) buildOrderMachine(businessId uuid.UUID, order *Order) (*stateless.StateMachine){
	sm := stateless.NewStateMachine(order.Status)	

	//configuration of the order state flow

	//[draft] -> [confirm/cancled]
	sm.Configure(StatusDraft).Permit(TriggerConfirm, StatusConfirmed).Permit(TriggerCancel, StatusCancelled)

	//[confirm] -> [fulfill/cancel]
	sm.Configure(StatusConfirmed).Permit(TriggerFullfill, StatusFulfilled).Permit(TriggerCancel, StatusCancelled)

	sm.Configure(StatusFulfilled).Permit(TriggerRequestRefund, StatusRefunded)

	sm.Configure(StatusCancelled).OnEntry(func(ctx context.Context, _ ...interface{}) error {
		err := s.emit(ctx, businessId, order.ID, "order.cancelled")
		if err != nil {
			return err
		}
		return nil
	})

	//here we are doing inter module interaction when an order has been confirmed such as (inv_decr, emiting events)
	sm.Configure(StatusConfirmed).
		OnEntryFrom(TriggerConfirm, func(ctx context.Context, args ...interface{}) error {
			lines := make([]inventory.DecrementLine, 0, len(order.Lines))
			invoiceLines := make([]invoices.LineRequest, 0, len(order.Lines))
			for _, line := range order.Lines {
				lines = append(lines, inventory.DecrementLine{ProductID: line.ProductID, Quantity: line.Quantity})

				productId := line.ProductID
				invoiceDesc := fmt.Sprintf("Product Id: %s | Unit Price : %s | Quantity: %s", line.ProductID.String(), line.UnitPrice, line.Quantity)
				invoiceLines = append(invoiceLines, invoices.LineRequest{
          ProductID: &productId,
					Quantity: line.Quantity,
					UnitPrice: line.UnitPrice,
  				Description: invoiceDesc,
				})

			}
			if s.inventory != nil {
				if err := s.inventory.DecrementForOrder(ctx, businessId, order.ID, lines); err != nil {
					return err
				}
			}
			now := time.Now().UTC()
			order.ConfirmedAt = &now
			err := s.emit(ctx, businessId, order.ID, "order.confirmed")
			
			if err != nil {
				return err
			}

			//Create an Invoice draft of the order
			invoiceDue := order.ConfirmedAt.AddDate(0, 0, 5)
			invoiceReq := invoices.CreateInvoiceRequest{
				CustomerID: order.CustomerID,	
				DueAt: &invoiceDue,
				Currency: "KES",	
				Lines: invoiceLines,
				Notes: fmt.Sprintf("Invoice for order ID: %s", order.ID.String()),
			}
			
			invoice, err := s.invoices.CreateInvoice(ctx, businessId, invoiceReq)

			//Initiate payment for the invoice
			var paymentCommandType payments.CommandType
			var paymentInitiateReq payments.InitiateRequest

			if order.PaymentMethod == "cash" {
				paymentCommandType = payments.CommandCash
				paymentInitiateReq.Provider = "cash"
			}
			 
			paymentInitiateReq.AccountReference = fmt.Sprintf("OrderID:%s|IdempotenancyKey:%s", order.ID.String(), order.IdempotencyKey)
			
			invoiceId := invoice.ID
			paymentInitiateReq.InvoiceID = &invoiceId
			paymentInitiateReq.Type = paymentCommandType
			paymentInitiateReq.Amount = invoice.Total
			paymentInitiateReq.Currency = invoice.Currency	

			customerPhone, ok := args[0].(string)
			if !ok {
				return errors.New("phone number not valid")
			}
			paymentInitiateReq.Phone = customerPhone

			_, err = s.payment.Initiate(ctx, businessId, paymentInitiateReq)

			if err != nil {
				return err
			}

			return nil

	})


		sm.Configure(StatusFulfilled).
		OnEntryFrom(TriggerFullfill, func(ctx context.Context, args...interface{}) error {
			saleLines := make([]sales.OrderLineInput, 0, len(order.Lines))
			for _, line := range order.Lines {
				saleLines = append(saleLines, sales.OrderLineInput{ProductID: line.ProductID, Quantity: line.Quantity, UnitPrice: line.UnitPrice})
			}
			if s.sales != nil {
				if staffId, ok := args[0].(uuid.UUID); ok {
					if _, err := s.sales.CreateFromOrder(ctx, businessId, staffId, order.ID, order.CustomerID, order.PaymentMethod, saleLines); err != nil {
						return err
					}
				} else {
					return errors.New("staff id required")
				}
			}

			now := time.Now().UTC()
			order.FulfilledAt = &now
			err := s.emit(ctx, businessId, order.ID, "order.fulfilled")
			if err != nil {
				return err
			}

			return nil
		})

	return sm
}

  


