package tenancy

import (
	"context"
	"net/http"

	sharedhttp "github.com/Codecx-Org/FinAI/backend/internal/shared/http"
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

func (m *Module) RegisterPublicRoutes(r chi.Router) {
	r.Get("/plans", func(w http.ResponseWriter, r *http.Request) { sharedhttp.JSON(w, http.StatusOK, Plans()) })
}

func (m *Module) RegisterRoutes(r chi.Router) {
	h := Handler{svc: m.svc}
	r.Get("/subscription", h.GetActiveSubscription)
}

func (m *Module) EnsureDefaultSubscription(ctx context.Context, userID uuid.UUID) (*Subscription, error) {
	return m.svc.EnsureDefaultSubscription(ctx, userID)
}

func (m *Module) EnforceBusinessLimit(ctx context.Context, userID uuid.UUID) error {
	return m.svc.EnforceBusinessLimit(ctx, userID)
}

func (m *Module) EnsureDefaultSubscriptionForUser(ctx context.Context, userID uuid.UUID) error {
	_, err := m.svc.EnsureDefaultSubscription(ctx, userID)
	return err
}
