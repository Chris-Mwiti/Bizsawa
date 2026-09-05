package payments

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/shopspring/decimal"

	"github.com/Codecx-Org/FinAI/backend/internal/invoices"
	"github.com/Codecx-Org/FinAI/backend/internal/orders"
)

// InvoiceEventArgs implements river.JobArgs for outbox job serialization.
type PaymentEventArgs struct {
	TenantID      uuid.UUID        `json:"tenant_id"`
	AggregateID   string           `json:"aggregate_id"`
	AggregateType string           `json:"aggregate_type"`
	EventType     PaymentEventType `json:"event_type"`
	Stream        string           `json:"stream"`
	PaymentID     uuid.UUID        `json:"paymentID"`
	Payload       json.RawMessage  `json:"payload"`
}

func (PaymentEventArgs) Kind() string { return "payment.event" }

func (PaymentEventArgs) InsertOpts() river.InsertOpts {
	return river.InsertOpts{MaxAttempts: 3}
}

// emit function for the services.
func (s *Service) emit(ctx context.Context, tx *sql.Tx, businessID uuid.UUID, paymentID uuid.UUID, eventType PaymentEventType, extra map[string]any) error {
	if s.outbox == nil {
		return fmt.Errorf("service outbox missing")
	}

	raw, err := json.Marshal(extra)
	if err != nil {
		s.logger.ErrorContext(ctx, "[PAYMENTS]-failed to marshal payload telemetry", "err", err)
		return err
	}

	_, err = s.outbox.InsertTx(ctx, tx, PaymentEventArgs{
		TenantID:      businessID,
		AggregateID:   paymentID.String(),
		AggregateType: "payment",
		PaymentID:     paymentID,
		EventType:     eventType,
		Stream:        "payments",
		Payload:       raw,
	}, nil)

	if err != nil {
		s.logger.ErrorContext(ctx, "[PAYMENTS]-error while submitting an outbox insert request via River", "err", err)
		return err
	}

	return nil
}

// struct to represent the workers.
type paymentWorker struct {
	river.WorkerDefaults[PaymentEventArgs]
	service        *Service
	orderService   OrderPayment
	invoiceService InvoicePayment
	logger         *slog.Logger
}

// for now the workers will not be majorly implemented since most of them rely on communication.
func (w *paymentWorker) Work(ctx context.Context, job *river.Job[PaymentEventArgs]) error {
	w.logger.InfoContext(ctx, "[PAYMENTS_WORKER]-worker dispatched", "paymentID", job.Args.PaymentID.String(), "businessID", job.Args.TenantID.String(), "eventType", job.Args.EventType)

	switch job.Args.EventType {
	case PaymentCreated, PaymentRetry:
		err := w.service.ExecuteProvider(ctx, job.Args.TenantID, job.Args.PaymentID)
		if err != nil {
			w.logger.ErrorContext(ctx, "[PAYMENTS_WORKER]-worker error", "err", err.Error(), "paymentID", job.Args.PaymentID.String())
			return err
		}

	case PaymentConfirmed:
		var payload map[string]any

		if err := json.Unmarshal(job.Args.Payload, &payload); err != nil {
			return fmt.Errorf("error while unmarshalling payload: %s", err.Error())
		}

		// Extract amount (payload may have float64 or string)
		var amount decimal.Decimal
		if amt, ok := payload["amount"].(float64); ok {
			amount = decimal.NewFromFloat(amt)
		} else if amtStr, ok := payload["amount"].(string); ok {
			var err error

			amount, err = decimal.NewFromString(amtStr)
			if err != nil {
				w.logger.ErrorContext(ctx, "[PAYMENTS_WORKER]-invalid amount format", "err", err.Error())
				return fmt.Errorf("invalid amount format: %w", err)
			}
		} else {
			return fmt.Errorf("missing or invalid amount in payload")
		}

		paidAt := time.Now().UTC()
		invoiceReq := invoices.RecordPaymentRequest{
			Amount:    amount,
			PaymentID: job.Args.PaymentID,
			PaidAt:    &paidAt,
		}

		if method, ok := payload["provider"].(string); ok {
			invoiceReq.Method = method
		}

		if ref, ok := payload["accountReference"].(string); ok {
			invoiceReq.Reference = ref
		}

		// Try customer-level settlement first (for both cash and mpesa)
		// 1. Direct customerId in payload
		if custStr, ok := payload["customerId"].(string); ok {
			if custID, err := uuid.Parse(custStr); err == nil {
				if _, err := w.invoiceService.SettleCustomerPayment(ctx, job.Args.TenantID, custID, invoiceReq); err == nil {
					w.logger.InfoContext(ctx, "[PAYMENTS_WORKER]-settled via customerId from payload", "customerID", custID.String())
					return nil
				}
			}
		}

		if orderID, ok := payload["orderID"]; ok {
			parsedID, err := uuid.Parse(orderID.(string))
			if err != nil {
				w.logger.ErrorContext(ctx, "[PAYMENTS_WORKER]-error while parsing orderID", "err", err.Error())
				return err
			}

			// Update order payment status
			_ = w.orderService.PaymentUpdate(ctx, job.Args.TenantID, parsedID, orders.PaymentConfirmed)

			// Try to settle by customer's unpaid invoices (FIFO) — preferred over single order invoice
			// Fetch order to get customerId
			if order, err := w.orderService.FindOrderByUpdate(ctx, job.Args.TenantID, parsedID); err == nil && order.CustomerID != nil {
				if result, err := w.invoiceService.SettleCustomerPayment(ctx, job.Args.TenantID, *order.CustomerID, invoiceReq); err == nil {
					w.logger.InfoContext(ctx, "[PAYMENTS_WORKER]-settled customer invoices FIFO", "customerID", order.CustomerID.String(), "allocations", len(result.Allocations), "totalApplied", result.TotalApplied.String())
					return nil
				}

				w.logger.WarnContext(ctx, "[PAYMENTS_WORKER]-customer settlement failed, falling back to order invoice", "err", err.Error())
			}

			// Fallback: legacy per-order invoice payment (specific)
			if err := w.invoiceService.RecordPayment(ctx, job.Args.TenantID, parsedID, invoiceReq); err != nil {
				w.logger.ErrorContext(ctx, "[PAYMENTS_WORKER]-error while recording payment for invoice", "orderID", parsedID, "err", err.Error())
				return err
			}

			return nil
		}

		// No orderID — try phone-based customer lookup for direct customer payments
		if phone, ok := payload["phone"].(string); ok && phone != "" {
			// This would require customers service lookup — for now log and return
			w.logger.InfoContext(ctx, "[PAYMENTS_WORKER]-direct customer payment via phone", "phone", phone)
			// TODO: lookup customer by phone and settle — currently no customer service in worker
		}

		return fmt.Errorf("unsupported payment payload: missing orderID and customerId")

	case PaymentFailed:
		var payload map[string]any

		if err := json.Unmarshal(job.Args.Payload, &payload); err != nil {
			return fmt.Errorf("error while unmarshalling payload: %s", err.Error())
		}

		if orderID, ok := payload["orderID"]; ok {
			parsedID, err := uuid.Parse(orderID.(string))
			if err != nil {
				w.logger.ErrorContext(
					ctx,
					"[PAYMENTS_WORKER]-error while parsing orderID",
					"err",
					err.Error(),
				)

				return err
			}

			err = w.orderService.PaymentUpdate(ctx, job.Args.TenantID, parsedID, orders.PaymentFailed)
			if err != nil {
				w.logger.ErrorContext(
					ctx,
					"[PAYMENTS_WORKER]-error while cancelling order",
					"orderID",
					orderID,
					"err",
					err.Error(),
				)

				return err
			}
		} else {
			return fmt.Errorf("unsupported format or orderID")
		}
	case PaymentProcessing:
		w.logger.InfoContext(ctx, "[PAYMENTS_WORKER]-worker observed state event", "paymentID", job.Args.PaymentID.String(), "eventType", job.Args.EventType)
		return nil
	default:
		w.logger.InfoContext(ctx, "[PAYMENTS_WORKER]-worker ignored unknown event", "paymentID", job.Args.PaymentID.String(), "eventType", job.Args.EventType)
		return nil
	}

	return nil
}
