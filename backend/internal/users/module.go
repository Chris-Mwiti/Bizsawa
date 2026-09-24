package users

import (
	"context"
	"log/slog"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/Codecx-Org/FinAI/backend/internal/shared/authz"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/email"
)

type Module struct {
	repo          *Repository
	svc           *Service
	inviteSvc     *InviteService
	db            *gorm.DB
}

func New(db *gorm.DB) *Module {
	repo := NewRepository(db)
	return &Module{repo: repo, svc: NewService(repo), db: db}
}

func (m *Module) InitInvites(emailSender email.Sender) {
	m.inviteSvc = NewInviteService(m.db, m.repo, emailSender)
	// resolve business name for invite email
	m.inviteSvc.WithBusinessNameFn(func(ctx context.Context, businessID uuid.UUID) string {
		var name string
		if err := m.db.WithContext(ctx).Raw("SELECT name FROM businesses WHERE id = ? LIMIT 1", businessID).Scan(&name).Error; err != nil {
			slog.ErrorContext(ctx, "failed to resolve business name for invite", "business", businessID, "err", err)
			return ""
		}
		return name
	})
}

func (m *Module) InviteService() *InviteService { return m.inviteSvc }

func (m *Module) RegisterProfileRoutes(r chi.Router) {
	h := Handler{svc: m.svc}
	r.Get("/", h.GetProfile)
	r.Post("/", h.CreateProfile)
	r.Put("/", h.UpdateProfile)
}

func (m *Module) RegisterRoutes(r chi.Router) {
	h := Handler{svc: m.svc, inviteSvc: m.inviteSvc, repo: m.repo, db: m.db}
	r.Get("/", h.ListMembers)
	r.Post("/invite", h.InviteMember)
	r.Post("/invite-email", h.InviteByEmail)
	r.Get("/invites", h.ListInvites)
	r.Post("/accept-invite", h.AcceptInvite)
	r.Put("/{memberID}/role", h.UpdateRole)
	r.Delete("/{memberID}", h.DeactivateMember)
}

func (m *Module) RegisterInvitePublicRoutes(r chi.Router) {
	h := Handler{svc: m.svc, inviteSvc: m.inviteSvc, repo: m.repo, db: m.db}
	r.Post("/accept", h.AcceptInvitePublic)
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