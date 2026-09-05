package invoices

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"maps"

	"github.com/google/uuid"
	"github.com/riverqueue/river"

	apperrors "github.com/Codecx-Org/FinAI/backend/internal/shared/errors"
)

// InvoiceEventArgs implements river.JobArgs for outbox job serialization.
type InvoiceEventArgs struct {
	TenantID      uuid.UUID        `json:"tenant_id"`
	AggregateID   string           `json:"aggregate_id"`
	AggregateType string           `json:"aggregate_type"`
	EventType     InvoiceEventType `json:"event_type"`
	Stream        string           `json:"stream"`
	InvoiceID     uuid.UUID        `json:"invoiceID"`
	Payload       json.RawMessage  `json:"payload"`
}

func (InvoiceEventArgs) Kind() string { return "invoice.event" }

// emit function for the services.
func (s *Service) emit(ctx context.Context, tx *sql.Tx, businessID uuid.UUID, invoiceID uuid.UUID, eventType InvoiceEventType, extra map[string]any) error {
	if s.outbox == nil {
		return fmt.Errorf("service outbox missing")
	}

	payload := map[string]any{"businessId": businessID}

	maps.Copy(payload, extra)

	raw, err := json.Marshal(payload)
	if err != nil {
		s.logger.ErrorContext(ctx, "[INVOICES]-failed to marshal payload telemetry", "err", err)
		return err
	}

	_, err = s.outbox.InsertTx(ctx, tx, InvoiceEventArgs{
		TenantID:      businessID,
		AggregateID:   invoiceID.String(),
		AggregateType: "invoice",
		InvoiceID:     invoiceID,
		EventType:     eventType,
		Stream:        "invoices",
		Payload:       raw,
	}, nil)

	if err != nil {
		s.logger.ErrorContext(ctx, "[INVOICES]-error while submitting an outbox insert request via River", "err", err)
		return err
	}

	return nil
}

// struct to represent the workers.
type invoiceWorker struct {
	river.WorkerDefaults[InvoiceEventArgs]
	service *Service
	logger  *slog.Logger
}

// for now the workers will not be majorly implemented since most of them rely on communication.
func (w *invoiceWorker) Work(ctx context.Context, job *river.Job[InvoiceEventArgs]) error {
	w.logger.InfoContext(ctx, "[INVOICES]-worker dispatched", "invoiceID", job.Args.InvoiceID.String(), "businessID", job.Args.TenantID.String())

	var globalErr error

	switch job.Args.EventType {
	case InvoicePaid:
		// by default the customer should receive the invoice document through whatsapp, or preffered communication channel
		// build the pdf for later channeling to the right communication channel
		_, err := w.service.PDF(ctx, job.Args.TenantID, job.Args.InvoiceID)
		if err != nil {
			w.logger.ErrorContext(ctx,
				"[INVOICES]-worker encoutered an error",
				"jobID", job.ID,
				"businessID", job.Args.TenantID.String(),
				"invoiceID", job.Args.InvoiceID.String(),
				"err", err.Error(),
			)

			globalErr = err
		}
		// submit document as an attachment to the channel
		break
	case InvoiceCancelled:
		// for this case the admin should be notified (by this is the businessOwner)
		// get the userID from the args which will be used by the businessService to get the phone
		var payload any

		err := json.Unmarshal(job.Args.Payload, &payload)
		if err != nil {
			w.logger.ErrorContext(ctx,
				"[INVOICES]-worker encoutered an error",
				"jobID", job.ID,
				"businessID", job.Args.TenantID.String(),
				"invoiceID", job.Args.InvoiceID.String(),
				"err", err.Error(),
			)

			globalErr = apperrors.ErrInternal.WithMessage("internal server err")
		}

		break
	case InvoiceOverdue:
		// send the invoice again with a reminder of the invoice being overdue
		_, err := w.service.PDF(ctx, job.Args.TenantID, job.Args.InvoiceID)
		if err != nil {
			w.logger.ErrorContext(ctx,
				"[INVOICES]-worker encoutered an error",
				"jobID", job.ID,
				"businessID", job.Args.TenantID.String(),
				"invoiceID", job.Args.InvoiceID.String(),
				"err", err.Error(),
			)

			globalErr = err
		}
		// submit document as an attachment to the channel
		break

	case InvoiceSent:
		// by default the customer should receive the invoice document through whatsapp, or preffered communication channel
		// build the pdf for later channeling to the right communication channel
		_, err := w.service.PDF(ctx, job.Args.TenantID, job.Args.InvoiceID)
		if err != nil {
			w.logger.ErrorContext(ctx,
				"[INVOICES]-worker encoutered an error",
				"jobID", job.ID,
				"businessID", job.Args.TenantID.String(),
				"invoiceID", job.Args.InvoiceID.String(),
				"err", err.Error(),
			)

			globalErr = err
		}
		// submit document as an attachment to the channel
		break
	}

	return globalErr
}
