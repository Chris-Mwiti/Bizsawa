package invoices

import (
	"github.com/Codecx-Org/FinAI/backend/internal/shared/outbox"
	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

type Module struct {
	repo *Repository
	svc  *Service
}

func New(db *gorm.DB, outboxRepo outbox.Repository) *Module {
	repo := NewRepository(db)
	return &Module{repo: repo, svc: NewService(repo, outboxRepo)}
}
func (m *Module) RegisterRoutes(r chi.Router) {
	h := Handler{svc: m.svc}
	r.Get("/", h.List)
	r.Post("/", h.Create)
	r.Get("/{id}", h.Get)
	r.Post("/{id}/send", h.Send)
	r.Post("/{id}/send-whatsapp", h.SendWhatsApp)
	r.Post("/{id}/record-payment", h.RecordPayment)
	r.Get("/{id}/pdf", h.PDF)
}
func (m *Module) Service() *Service { return m.svc }
