package orders

import (
	"github.com/Codecx-Org/FinAI/backend/internal/customers"
	"github.com/Codecx-Org/FinAI/backend/internal/inventory"
	"github.com/Codecx-Org/FinAI/backend/internal/invoices"
	"github.com/Codecx-Org/FinAI/backend/internal/payments"
	"github.com/Codecx-Org/FinAI/backend/internal/sales"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/outbox"
	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

type Module struct {
	repo *Repository
	svc  *Service
}

func New(db *gorm.DB, inventory *inventory.Service, sales *sales.Service, outboxRepo outbox.Repository, customers *customers.Service, payment *payments.Service, invoice *invoices.Service) *Module {
	repo := NewRepository(db)
	return &Module{repo: repo, svc: NewService(repo, inventory, sales, outboxRepo,invoice,payment,customers)}
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
