package auth

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"

	sharedhttp "github.com/Codecx-Org/FinAI/backend/internal/shared/http"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/config"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/middleware"
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
	googleCfg     *config.GoogleConfig
}

func WithMembershipResolver(resolver MembershipResolver) Option {
	return func(opts *options) { opts.memberships = resolver }
}

func WithSubscriptionProvisioner(provisioner SubscriptionProvisioner) Option {
	return func(opts *options) { opts.subscriptions = provisioner }
}

func WithGoogleConfig(cfg config.GoogleConfig) Option {
	return func(opts *options) { opts.googleCfg = &cfg }
}

func New(db *gorm.DB, cfg Config, opts ...Option) *Module {
	options := options{}
	for _, opt := range opts {
		opt(&options)
	}

	repo := NewRepository(db)
	tokens := NewTokenService(cfg)
	svc := NewService(repo, tokens, options.memberships, options.subscriptions)
	if options.googleCfg != nil {
		svc.WithGoogleConfig(*options.googleCfg)
	}

	return &Module{repo: repo, tokens: tokens, svc: svc}
}

func (m *Module) RegisterRoutes(r chi.Router) {
	h := Handler{svc: m.svc}
	r.Post("/register", h.Register)
	r.Post("/login", h.Login)
	r.Post("/refresh", h.Refresh)
	// Google SSO — better-auth parity: idToken flow (mobile) + callback (web)
	// POST /auth/google  {idToken:{token, accessToken}} per GoogleSocialLogin.md
	r.Post("/google", h.GoogleLogin)
	r.Post("/google/callback", h.GoogleLogin)
	r.Get("/google", h.GoogleRedirect)
	r.Get("/google/callback", h.GoogleCallback)

	// Email OTP — better-auth EmailOTP plugin parity: Agents_Documents/BetterAuth/EmailOTP.md
	// sendVerificationOTP covers sign-in, email-verification, forget-password
	r.Post("/email-otp/send-verification-otp", h.SendVerificationOTP)
	r.Post("/email-otp/check-verification-otp", h.CheckVerificationOTP)
	r.Post("/email-otp/verify-email", h.VerifyEmailOTP)
	r.Post("/sign-in/email-otp", h.SignInEmailOTP)
	r.Post("/email-otp/request-password-reset", h.RequestPasswordResetOTP)
	r.Post("/email-otp/reset-password", h.ResetPasswordOTP)

	// Backward-compat aliases per EmailPassword.md / EmailOTP.md deprecated paths
	r.Post("/otp/send", h.SendVerificationOTP)
	r.Post("/otp/verify", h.CheckVerificationOTP)
	r.Post("/forgot-password", h.RequestPasswordResetOTP)
	r.Post("/reset-password-otp", h.ResetPasswordOTP)
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
