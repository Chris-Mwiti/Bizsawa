package orders

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"maps"

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
	payload := map[string]any{"businessId": businessID}

	maps.Copy(payload, extra)
	raw, err := json.Marshal(payload)
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

// struct to represent the workers
type orderWorker struct {
	river.WorkerDefaults[OrderEventArgs]
	service *Service
	logger  *slog.Logger
}

// execution and dispation of workers based on the event type.
// for now the workers will not be majorly implemented since most of them rely on communication
func (w *orderWorker) Work(ctx context.Context, job *river.Job[OrderEventArgs]) error {

	w.logger.InfoContext(ctx, "[ORDERS]-worker dispatched", "invoiceID", job.Args.OrderID.String(), "businessID", job.Args.TenantID.String())

	var globalErr error

	switch job.Args.EventType {
	}

	return globalErr
}
