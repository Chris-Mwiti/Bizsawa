package orders

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"maps"

	"github.com/Codecx-Org/FinAI/backend/internal/shared/models"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
)

// InvoiceEventArgs implements river.JobArgs for outbox job serialization
type OrderEventArgs struct {
	TenantID      uuid.UUID        `json:"tenant_id"`
	AggregateID   string           `json:"aggregate_id"`
	AggregateType string           `json:"aggregate_type"`
	EventType     OrderEventType `json:"event_type"`
	Stream        string           `json:"stream"`
	OrderID     uuid.UUID        `json:"orderID"`
	Payload       json.RawMessage  `json:"payload"`
}

func (OrderEventArgs) Kind() string { return "order.event" }

// emit function for the services
func (s *Service) emit(ctx context.Context, tx *sql.Tx, businessID uuid.UUID, orderID uuid.UUID, eventType OrderEventType, extra map[string]any) error {
	if s.outbox == nil {
		return fmt.Errorf("service outbox missing")
	}

	raw, err := json.Marshal(extra)
	if err != nil {
		s.logger.ErrorContext(ctx, "[ORDERS]-failed to marshal payload telemetry", "err", err)
		return err
	}

	_, err = s.outbox.InsertTx(ctx, tx, OrderEventArgs{
		TenantID:      businessID,
		AggregateID:   orderID.String(),
		AggregateType: "order",
		OrderID:     orderID,
		EventType:     eventType,
		Stream:        "orders",
		Payload:       raw,
	}, nil)

	if err != nil {
		s.logger.ErrorContext(ctx, "[ORDERS]-error while submitting an outbox insert request via River", "err", err)
		return err
	}
	return nil
}

type OrderPaymentInterface interface {
	InitiateOrder(ctx context.Context, businessID uuid.UUID, req models.InitiateRequest) (error) 
}

// struct to represent the workers
type orderWorker struct {
	river.WorkerDefaults[OrderEventArgs]
	service *Service
	paymentService OrderPaymentInterface
	logger  *slog.Logger
}

// execution and dispation of workers based on the event type.
// for now the workers will not be majorly implemented since most of them rely on communication
func (w *orderWorker) Work(ctx context.Context, job *river.Job[OrderEventArgs]) error {

	w.logger.InfoContext(ctx, "[ORDERS]-worker dispatched", "orderID", job.Args.OrderID.String(), "businessID", job.Args.TenantID.String())

	switch job.Args.EventType {
	case OrderPaymentInit:
		var payload models.InitiateRequest
		if err := json.Unmarshal(job.Args.Payload, &payload); err != nil {
			w.logger.ErrorContext(ctx, "[ORDER_WORKER]-error while unmarshalling request", "err", err.Error(), "businessID", job.Args.TenantID.String())
			return err
		}
		err := w.paymentService.InitiateOrder(ctx, job.Args.TenantID, payload)
		if err != nil {
			w.logger.ErrorContext(ctx, "[ORDER_WORKER]-error while initiating payment request", "err", err.Error(), "businessID", job.Args.TenantID.String())
			return err
		}
	default:
		w.logger.WarnContext(ctx, "[ORDER_WORKER]-unhandled event type skipped execution", 
			"eventType", string(job.Args.EventType),
			"businessID", job.Args.TenantID.String(),
		)
	}

	return nil
}
