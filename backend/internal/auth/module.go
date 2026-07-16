package auth

import (
	"context"
	"net/http"
	"strings"
	"time"

	sharedhttp "github.com/Codecx-Org/FinAI/backend/internal/shared/http"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/middleware"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Module struct {
	repo   *Repository
	tokens *TokenService
	svc    *Service
}

type Option func(*options)

type options struct {
	memberships   MembershipResolver
	subscriptions SubscriptionProvisioner
}

func WithMembershipResolver(resolver MembershipResolver) Option {
	return func(opts *options) { opts.memberships = resolver }
}

func WithSubscriptionProvisioner(provisioner SubscriptionProvisioner) Option {
	return func(opts *options) { opts.subscriptions = provisioner }
}

func New(db *gorm.DB, cfg Config, opts ...Option) *Module {
	options := options{}
	for _, opt := range opts {
		opt(&options)
	}
	repo := NewRepository(db)
	tokens := NewTokenService(cfg)
	svc := NewService(repo, tokens, options.memberships, options.subscriptions)
	return &Module{repo: repo, tokens: tokens, svc: svc}
}

func (m *Module) RegisterRoutes(r chi.Router) {
	h := Handler{svc: m.svc}
	r.Post("/register", h.Register)
	r.Post("/login", h.Login)
	r.Post("/refresh", h.Refresh)
}

func (m *Module) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			sharedhttp.Error(w, ErrUnauthorized)
			return
		}
		claims, err := m.tokens.Verify(strings.TrimPrefix(header, "Bearer "))
		if err != nil {
			sharedhttp.Error(w, ErrUnauthorized)
			return
		}
		ctx := middleware.WithUserID(r.Context(), claims.UserID)
		if claims.TenantID != uuid.Nil {
			ctx = middleware.WithTenantID(ctx, claims.TenantID)
		}
		if claims.BusinessID != uuid.Nil {
			ctx = middleware.WithBusinessID(ctx, claims.BusinessID)
		}
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (m *Module) UserByID(ctx context.Context, id uuid.UUID) (*User, error) {
	return m.repo.FindByID(ctx, id)
}

type Config struct {
	SigningKey string
	Issuer     string
	AccessTTL  time.Duration
	RefreshTTL time.Duration
}
