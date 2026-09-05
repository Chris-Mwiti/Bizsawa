package analytics

import (
	"context"
	"database/sql"
	"log/slog"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"gorm.io/gorm"
)

type Module struct {
	repo   *Repository
	svc    *Service
	logger *slog.Logger
	ingest *river.Client[*sql.Tx]
	db     *gorm.DB
}

func New(db *gorm.DB, ingest *river.Client[*sql.Tx], logger *slog.Logger) *Module {
	if logger == nil {
		logger = slog.Default()
	}

	repo := NewRepository(db)

	return &Module{repo: repo, svc: NewService(repo, logger), logger: logger, ingest: ingest, db: db}
}

func (m *Module) enqueue(businessID uuid.UUID, tf Timeframe) error {
	if m.ingest == nil {
		return nil
	}

	sqlDB, err := m.db.DB()
	if err != nil {
		return err
	}

	tx, err := sqlDB.Begin()
	if err != nil {
		return err
	}

	defer tx.Rollback()

	if _, err := m.ingest.InsertTx(context.Background(), tx, ComputeArgs{BusinessID: businessID, Timeframe: tf}, nil); err != nil {
		return err
	}

	return tx.Commit()
}

func (m *Module) RegisterRoutes(r chi.Router) {
	h := Handler{svc: m.svc, enqueue: m.enqueue}
	r.Get("/", h.Get)
	r.Post("/refresh", h.Refresh)
}

func (m *Module) RegisterWorkers(workers *river.Workers) {
	river.AddWorker(workers, &worker{service: m.svc, logger: m.logger})
	river.AddWorker(workers, &computeAllWorker{service: m.svc, logger: m.logger})
}

func (m *Module) Service() *Service { return m.svc }
