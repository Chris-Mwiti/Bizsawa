package sales

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

type SaleEventType string

const SaleCreated SaleEventType = "sale.created"

type SaleEventArgs struct {
	TenantID      uuid.UUID       `json:"tenant_id"`
	AggregateID   string          `json:"aggregate_id"`
	AggregateType string          `json:"aggregate_type"`
	EventType     SaleEventType   `json:"event_type"`
	Stream        string          `json:"stream"`
	SaleID        uuid.UUID       `json:"saleID"`
	Payload       json.RawMessage `json:"payload"`
}

func (SaleEventArgs) Kind() string { return "sale.event" }

func (s *Service) emit(ctx context.Context, tx *sql.Tx, businessID, saleID uuid.UUID, eventType SaleEventType, extra map[string]any) error {
	if s.outbox == nil {
		return fmt.Errorf("service outbox missing")
	}
	payload := map[string]any{"businessId": businessID, "saleId": saleID}
	maps.Copy(payload, extra)
	raw, err := json.Marshal(payload)
	if err != nil {
		s.logger.ErrorContext(ctx, "[SALES]-failed to marshal payload telemetry", "err", err)
		return err
	}
	_, err = s.outbox.InsertTx(ctx, tx, SaleEventArgs{TenantID: businessID, AggregateID: saleID.String(), AggregateType: "sale", EventType: eventType, Stream: "sales", SaleID: saleID, Payload: raw}, nil)
	if err != nil {
		s.logger.ErrorContext(ctx, "[SALES]-error while submitting event via River", "err", err)
	}
	return err
}

type saleWorker struct {
	river.WorkerDefaults[SaleEventArgs]
	logger *slog.Logger
}

func (w *saleWorker) Work(ctx context.Context, job *river.Job[SaleEventArgs]) error {
	w.logger.InfoContext(ctx, "[SALES]-worker dispatched", "saleID", job.Args.SaleID.String(), "businessID", job.Args.TenantID.String(), "eventType", job.Args.EventType)
	return nil
}
