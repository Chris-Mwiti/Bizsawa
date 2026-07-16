package users

import (
	"context"

	"github.com/Codecx-Org/FinAI/backend/internal/shared/authz"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
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

func (m *Module) RegisterProfileRoutes(r chi.Router) {
	h := Handler{svc: m.svc}
	r.Get("/", h.GetProfile)
	r.Post("/", h.CreateProfile)
	r.Put("/", h.UpdateProfile)
}

func (m *Module) RegisterRoutes(r chi.Router) {
	h := Handler{svc: m.svc}
	r.Get("/", h.ListMembers)
	r.Post("/invite", h.InviteMember)
	r.Put("/{memberID}/role", h.UpdateRole)
	r.Delete("/{memberID}", h.DeactivateMember)
}

func (m *Module) AddOwner(ctx context.Context, businessID, userID uuid.UUID) error {
	return m.svc.AddOwner(ctx, businessID, userID)
}

func (m *Module) RoleForUser(ctx context.Context, businessID uuid.UUID, userID uuid.UUID) (authz.Role, error) {
	member, err := m.repo.FindActiveByBusinessAndUser(ctx, businessID, userID)
	if err != nil {
		return "", err
	}
	return authz.Role(member.Role), nil
}
