package business

import (
	"context"

	sharedcrypto "github.com/Codecx-Org/FinAI/backend/internal/shared/crypto"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type SubscriptionGuard interface {
	EnforceBusinessLimit(ctx context.Context, userID uuid.UUID) error
	EnsureDefaultSubscription(ctx context.Context, userID uuid.UUID) (any, error)
}
type MemberWriter interface {
	AddOwner(ctx context.Context, businessID, userID uuid.UUID) error
}

type Module struct {
	repo *Repository
	svc  *Service
}

func New(db *gorm.DB, guard BusinessLimitEnforcer, members MemberWriter, crypto *sharedcrypto.Manager) *Module {
	repo := NewRepository(db)
	return &Module{repo: repo, svc: NewService(repo, guard, members, crypto)}
}

type BusinessLimitEnforcer interface {
	EnforceBusinessLimit(ctx context.Context, userID uuid.UUID) error
}

func (m *Module) RegisterRoutes(r chi.Router) {
	h := Handler{svc: m.svc}
	r.Get("/", h.ListBusinesses)
	r.Post("/", h.CreateBusiness)
	r.Get("/{businessID}", h.GetBusiness)
	r.Put("/{businessID}", h.UpdateBusiness)
	r.Delete("/{businessID}", h.DeleteBusiness)
}
