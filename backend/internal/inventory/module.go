package inventory

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
	r.Get("/", h.List)
	r.Post("/adjustments", h.Adjust)
	r.Get("/low-stock", h.LowStock)
	r.Get("/movements", h.Movements)
	r.Get("/valuation", h.Valuation)
}
func (m *Module) Service() *Service { return m.svc }
