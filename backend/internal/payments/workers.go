package payments

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"maps"

	"github.com/Codecx-Org/FinAI/backend/internal/orders"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
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

// emit function for the services
func (s *Service) emit(ctx context.Context, tx *sql.Tx, businessID uuid.UUID, paymentID uuid.UUID, eventType PaymentEventType, extra map[string]any) error {
	if s.outbox == nil {
		return fmt.Errorf("service outbox missing")
	}
	payload := map[string]any{"businessId": businessID}

	maps.Copy(payload, extra)
	raw, err := json.Marshal(payload)
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
	service *Service
	orderService OrderPayment
	logger  *slog.Logger
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

		if orderID, ok := payload["orderID"].(string); ok {
			parsedID, err := uuid.Parse(orderID)
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
		}

	case PaymentProcessing, PaymentFailed:
		w.logger.InfoContext(ctx, "[PAYMENTS_WORKER]-worker observed state event", "paymentID", job.Args.PaymentID.String(), "eventType", job.Args.EventType)
		return nil
	default:
		w.logger.InfoContext(ctx, "[PAYMENTS_WORKER]-worker ignored unknown event", "paymentID", job.Args.PaymentID.String(), "eventType", job.Args.EventType)
		return nil
	}

	return nil
}
