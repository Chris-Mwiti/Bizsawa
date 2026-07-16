package taxes

import (
	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

type Module struct {
	repo *Repository
	svc  *Service
}

func New(db *gorm.DB) *Module {
	repo := NewRepository(db)
	return &Module{repo: repo, svc: NewService(repo)}
}
func (m *Module) RegisterRoutes(r chi.Router) {
	h := Handler{svc: m.svc}
	r.Get("/rules", h.ListRules)
	r.Post("/rules", h.CreateRule)
	r.Post("/kenya-vat-default", h.EnsureVAT)
	r.Get("/summary", h.Summary)
}
func (m *Module) Service() *Service { return m.svc }
