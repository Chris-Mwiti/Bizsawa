package sales

import (
	"database/sql"
	"log/slog"

	"github.com/go-chi/chi/v5"
	"github.com/riverqueue/river"
	"gorm.io/gorm"
)

type Module struct {
	repo   *Repository
	svc    *Service
	logger *slog.Logger
}

func New(db *gorm.DB, taxes TaxRecorder, outboxRepo *river.Client[*sql.Tx], logger *slog.Logger) *Module {
	if logger == nil {
		logger = slog.Default()
	}
	repo := NewRepository(db)
	return &Module{repo: repo, svc: NewService(repo, taxes, outboxRepo, logger), logger: logger}
}

func (m *Module) RegisterRoutes(r chi.Router) {
	h := Handler{svc: m.svc}
	r.Get("/", h.List)
	r.Post("/", h.Create)
	r.Get("/summary", h.Summary)
	r.Get("/by-payment-method", h.ByPayment)
	r.Get("/by-staff", h.ByStaff)
	r.Get("/by-product", h.ByProduct)
	r.Get("/{id}", h.Get)
	r.Post("/{id}/void", h.Void)
}

func (m *Module) RegisterWorkers(workers *river.Workers) {
	river.AddWorker(workers, &saleWorker{logger: m.logger})
}

func (m *Module) Service() *Service { return m.svc }
