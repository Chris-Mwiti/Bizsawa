package orders

import (
	"database/sql"
	"log/slog"

	"github.com/Codecx-Org/FinAI/backend/internal/customers"
	"github.com/Codecx-Org/FinAI/backend/internal/inventory"
	"github.com/Codecx-Org/FinAI/backend/internal/invoices"
	"github.com/Codecx-Org/FinAI/backend/internal/sales"
	"github.com/go-chi/chi/v5"
	"github.com/riverqueue/river"
	"gorm.io/gorm"
)

type Module struct {
	repo   *Repository
	svc    *Service
	logger *slog.Logger
}

func New(db *gorm.DB, inventory *inventory.Service, sales *sales.Service, outboxRepo *river.Client[*sql.Tx], customers *customers.Service, invoice *invoices.Service, payments OrderPaymentInterface, logger *slog.Logger) *Module {
	if logger == nil {
		logger = slog.Default()
	}
	repo := NewRepository(db)
	return &Module{repo: repo, svc: NewService(repo, inventory, sales, outboxRepo, logger, invoice, customers), logger: logger}
}
func (m *Module) RegisterRoutes(r chi.Router) {
	h := Handler{svc: m.svc}
	r.Get("/", h.List)
	r.Post("/", h.Create)
	r.Get("/{id}", h.Get)
	r.Post("/{id}/confirm", h.Confirm)
	r.Post("/{id}/fulfill", h.Fulfill)
	r.Post("/{id}/cancel", h.Cancel)
	r.Post("/{id}/refund", h.Refund)
}
func (m *Module) Service() *Service { return m.svc }

func (m *Module) RegisterWorkers(worker *river.Workers) {
	river.AddWorker(worker, &orderWorker{service: m.svc, paymentService: m.svc.payments, logger: m.logger})
}
