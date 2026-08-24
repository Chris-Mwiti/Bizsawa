package payments

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/Codecx-Org/FinAI/backend/internal/invoices"
	"github.com/Codecx-Org/FinAI/backend/internal/orders"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/shopspring/decimal"
)

// InvoiceEventArgs implements river.JobArgs for outbox job serialization
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

// emit function for the services
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

// struct to represent the workers
type paymentWorker struct {
	river.WorkerDefaults[PaymentEventArgs]
	service        *Service
	orderService   OrderPayment
	invoiceService InvoicePayment
	logger         *slog.Logger
}

// execution and dispation of workers based on the event type.
// for now the workers will not be majorly implemented since most of them rely on communication
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

			err = w.orderService.PaymentUpdate(ctx, job.Args.TenantID, parsedID, orders.PaymentConfirmed)
			if err != nil {
				w.logger.ErrorContext(
					ctx,
					"[PAYMENTS_WORKER]-error while confirming order",
					"orderID",
					orderID,
					"err",
					err.Error(),
				)
				return err
			}

			//record payment for the invoice associated with the order
			paidAt := time.Now().UTC()
			
			// JSON unmarshal produces float64 for numbers, convert to decimal.Decimal
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

			invoiceReq := invoices.RecordPaymentRequest{
				Amount:    amount,
				PaymentID: job.Args.PaymentID,
				PaidAt:    &paidAt,
			}
			if err := w.invoiceService.RecordPayment(ctx, job.Args.TenantID, parsedID, invoiceReq); err != nil {
				w.logger.ErrorContext(ctx, "[PAYMENTS_WORKER]-error while recording payment for invoice", "orderID", parsedID, "err", err.Error())
				return err
			}
			return fmt.Errorf("unsupported format or orderID")
		}
	
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
