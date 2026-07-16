package outbox

import (
	"context"
	"log/slog"
	"time"

	"github.com/Codecx-Org/FinAI/backend/internal/shared/eventbus"
)

type RelayConfig struct {
	BatchSize     int
	PollInterval  time.Duration
	DefaultStream string
}

type Relay struct {
	repo   Repository
	bus    eventbus.Bus
	cfg    RelayConfig
	logger *slog.Logger
}

func NewRelay(repo Repository, bus eventbus.Bus, cfg RelayConfig, logger *slog.Logger) *Relay {
	if cfg.BatchSize == 0 {
		cfg.BatchSize = 100
	}
	if cfg.PollInterval == 0 {
		cfg.PollInterval = 500 * time.Millisecond
	}
	if cfg.DefaultStream == "" {
		cfg.DefaultStream = "events"
	}
	if logger == nil {
		logger = slog.Default()
	}
	return &Relay{repo: repo, bus: bus, cfg: cfg, logger: logger}
}

func (r *Relay) Start(ctx context.Context) error {
	ticker := time.NewTicker(r.cfg.PollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			r.processBatch(ctx)
		}
	}
}

func (r *Relay) processBatch(ctx context.Context) {
	events, err := r.repo.ClaimBatch(ctx, r.cfg.BatchSize)
	if err != nil {
		r.logger.Error("outbox claim failed", "err", err)
		return
	}

	for _, evt := range events {
		stream := evt.Stream
		if stream == "" {
			stream = r.cfg.DefaultStream
		}
		err := r.bus.Publish(ctx, stream, eventbus.Event{
			ID:            evt.ID,
			TenantID:      evt.TenantID,
			AggregateID:   evt.AggregateID,
			AggregateType: evt.AggregateType,
			Type:          evt.EventType,
			Payload:       evt.Payload,
			OccurredAt:    evt.CreatedAt,
		})
		if err != nil {
			_ = r.repo.MarkFailed(ctx, evt.ID, err)
			r.logger.Warn("outbox publish failed", "eventID", evt.ID, "err", err)
			continue
		}
		_ = r.repo.MarkSent(ctx, evt.ID)
	}
}
