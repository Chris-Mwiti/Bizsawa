package sales

import (
	"github.com/Codecx-Org/FinAI/backend/internal/shared/outbox"
	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

type Module struct {
	repo *Repository
	svc  *Service
}

func New(db *gorm.DB, taxes TaxRecorder, outboxRepo outbox.Repository) *Module {
	repo := NewRepository(db)
	return &Module{repo: repo, svc: NewService(repo, taxes, outboxRepo)}
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
func (m *Module) Service() *Service { return m.svc }
