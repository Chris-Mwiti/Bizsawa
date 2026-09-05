package analytics

import (
	"context"
	"log/slog"

	"github.com/google/uuid"
	"github.com/riverqueue/river"
)

// ComputeArgs is a River job that pre-computes a snapshot for a
// business/timeframe pair.
type ComputeArgs struct {
	BusinessID uuid.UUID `json:"business_id"`
	Timeframe  Timeframe `json:"timeframe"`
}

func (ComputeArgs) Kind() string { return "analytics.compute" }

func (ComputeArgs) InsertOpts() river.InsertOpts {
	return river.InsertOpts{MaxAttempts: 5}
}

// ComputeAllArgs recomputes every standard timeframe for a business.
type ComputeAllArgs struct {
	BusinessID uuid.UUID `json:"business_id"`
}

func (ComputeAllArgs) Kind() string { return "analytics.compute.all" }

func (ComputeAllArgs) InsertOpts() river.InsertOpts {
	return river.InsertOpts{MaxAttempts: 5}
}

type worker struct {
	river.WorkerDefaults[ComputeArgs]
	service *Service
	logger  *slog.Logger
}

func (w *worker) Work(ctx context.Context, job *river.Job[ComputeArgs]) error {
	w.logger.InfoContext(ctx, "[ANALYTICS]-computing snapshot",
		"businessID", job.Args.BusinessID.String(),
		"timeframe", string(job.Args.Timeframe))

	_, err := w.service.Compute(ctx, job.Args.BusinessID, job.Args.Timeframe)

	return err
}

type computeAllWorker struct {
	river.WorkerDefaults[ComputeAllArgs]
	service *Service
	logger  *slog.Logger
}

func (w *computeAllWorker) Work(ctx context.Context, job *river.Job[ComputeAllArgs]) error {
	w.logger.InfoContext(ctx, "[ANALYTICS]-computing all snapshots", "businessID", job.Args.BusinessID.String())

	for _, tf := range []Timeframe{TimeframeDay, TimeframeWeek, TimeframeMonth, TimeframeYear} {
		if _, err := w.service.Compute(ctx, job.Args.BusinessID, tf); err != nil {
			return err
		}
	}

	return nil
}
