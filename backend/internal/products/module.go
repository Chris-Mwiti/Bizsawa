package products

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
	r.Post("/", h.Create)
	r.Get("/{id}", h.Get)
	r.Put("/{id}", h.Update)
	r.Delete("/{id}", h.Delete)
	r.Post("/{id}/generate-description", h.GenerateDescription)
	r.Get("/variant/{id}", h.GetVariant)
}
