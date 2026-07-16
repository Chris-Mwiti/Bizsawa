package expenses

import (
	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

type Module struct {
	repo *Repository
	svc  *Service
}

func New(db *gorm.DB, taxes TaxRecorder) *Module {
	repo := NewRepository(db)
	return &Module{repo: repo, svc: NewService(repo, taxes)}
}
func (m *Module) RegisterRoutes(r chi.Router) {
	h := Handler{svc: m.svc}
	r.Get("/", h.List)
	r.Post("/", h.Create)
	r.Get("/summary", h.Summary)
	r.Get("/{id}", h.Get)
	r.Delete("/{id}", h.Delete)
}
