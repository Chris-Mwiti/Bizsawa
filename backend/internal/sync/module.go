package sync

import (
	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

type Module struct {
	svc *Service
	h   *Handler
}

func New(db *gorm.DB) *Module {
	svc := NewService(db)
	return &Module{svc: svc, h: NewHandler(svc)}
}

func (m *Module) Service() *Service { return m.svc }
func (m *Module) Handler() *Handler { return m.h }

func (m *Module) RegisterRoutes(r chi.Router) {
	r.Get("/pull", m.h.Pull)
	r.Post("/push", m.h.Push)
	r.Get("/conflicts", m.h.ListConflicts)
	r.Post("/conflicts/{id}/resolve", m.h.ResolveConflict)
}
