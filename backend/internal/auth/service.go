package auth

import (
	"context"
	"errors"
	"log/slog"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"github.com/Codecx-Org/FinAI/backend/internal/shared/authz"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/config"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/email"
)

type MembershipResolver interface {
	RoleForUser(ctx context.Context, businessID uuid.UUID, userID uuid.UUID) (authz.Role, error)
}

type SubscriptionProvisioner interface {
	EnsureDefaultSubscriptionForUser(ctx context.Context, userID uuid.UUID) error
}

type Service struct {
	repo          *Repository
	tokens        *TokenService
	memberships   MembershipResolver
	subscriptions SubscriptionProvisioner
	googleCfg     *config.GoogleConfig
	emailSender   email.Sender
	clerkVerifier *ClerkVerifier
}

func NewService(repo *Repository, tokens *TokenService, memberships MembershipResolver, subscriptions SubscriptionProvisioner) *Service {
	return &Service{
		repo:          repo,
		tokens:        tokens,
		memberships:   memberships,
		subscriptions: subscriptions,
	}
}

// WithEmailSender injects the email provider (Resend/Noop). Optional — falls back to Noop if nil.
func (s *Service) WithEmailSender(sender email.Sender) *Service {
	s.emailSender = sender
	return s
}

type RegisterRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}
type LoginRequest struct {
	Email      string     `json:"email"`
	Password   string     `json:"password"`
	BusinessID *uuid.UUID `json:"businessId"`
}
type RefreshRequest struct {
	RefreshToken string `json:"refreshToken"`
}
type AuthResponse struct {
	UserID       uuid.UUID `json:"userId"`
	AccessToken  string    `json:"accessToken"`
	RefreshToken string    `json:"refreshToken"`
	// BusinessID is the business the session was scoped to. It is resolved
	// server-side on every login path (email OTP, Clerk SSO, password) so the
	// client always lands on the right business regardless of which sign-in
	// method was used. Nil when the user has no business yet.
	BusinessID *uuid.UUID `json:"businessId,omitempty"`
	Role       string     `json:"role,omitempty"`
	// Profile fields — clients read these to render the signed-in user.
	Email string `json:"email,omitempty"`
	Name  string `json:"name,omitempty"`
	Image string `json:"image,omitempty"`
}

// defaultBusinessForUser picks the business a session should be scoped to
// when the caller did not specify one. Owner membership wins over other
// roles, then the oldest membership wins, so the choice is deterministic
// and stable across sign-in methods.
func (s *Service) defaultBusinessForUser(ctx context.Context, userID uuid.UUID) (uuid.UUID, string, error) {
	type membership struct {
		BusinessID uuid.UUID `gorm:"column:business_id"`
		Role       string    `gorm:"column:role"`
	}

	var memberships []membership

	err := s.repo.db.WithContext(ctx).
		Raw(`SELECT business_id, role FROM business_members
			WHERE user_id = ? AND is_active = true AND deleted_at IS NULL
			ORDER BY CASE WHEN role = 'OWNER' THEN 0 ELSE 1 END, joined_at ASC NULLS LAST, created_at ASC
			LIMIT 1`, userID).Scan(&memberships).Error
	if err != nil {
		return uuid.Nil, "", err
	}

	if len(memberships) == 0 {
		return uuid.Nil, "", nil
	}

	return memberships[0].BusinessID, memberships[0].Role, nil
}

func (s *Service) Register(ctx context.Context, req RegisterRequest) (*AuthResponse, error) {
	if req.Email == "" || len(req.Password) < 8 {
		return nil, ErrUnauthorized
	}

	_, err := s.repo.FindByEmail(ctx, req.Email)
	if err == nil {
		return nil, ErrEmailTaken
	}

	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	user := &User{Email: normalizeEmail(req.Email), PasswordHash: string(hash), IsActive: true}
	if err := s.repo.CreateUser(ctx, user); err != nil {
		return nil, err
	}

	if s.subscriptions != nil {
		if err := s.subscriptions.EnsureDefaultSubscriptionForUser(ctx, user.ID); err != nil {
			return nil, err
		}
	}

	return s.issue(ctx, user.ID, uuid.Nil, uuid.Nil, nil)
}

func (s *Service) Login(ctx context.Context, req LoginRequest) (*AuthResponse, error) {
	user, err := s.repo.FindByEmail(ctx, req.Email)
	if err != nil {
		return nil, ErrUnauthorized
	}

	if !user.IsActive {
		return nil, ErrInactiveUser
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		return nil, ErrUnauthorized
	}

	businessID := uuid.Nil
	roles := []string(nil)

	if req.BusinessID != nil && *req.BusinessID != uuid.Nil {
		if s.memberships == nil {
			return nil, ErrUnauthorized
		}

		role, err := s.memberships.RoleForUser(ctx, *req.BusinessID, user.ID)
		if err != nil {
			return nil, ErrUnauthorized
		}

		businessID = *req.BusinessID
		roles = []string{string(role)}
	}

	return s.issue(ctx, user.ID, businessID, businessID, roles)
}

func (s *Service) Refresh(ctx context.Context, req RefreshRequest) (*AuthResponse, error) {
	token, err := s.repo.FindRefreshToken(ctx, HashRefreshToken(req.RefreshToken))
	if err != nil {
		return nil, ErrUnauthorized
	}

	if err := s.repo.RevokeRefreshToken(ctx, token.ID); err != nil {
		return nil, err
	}

	return s.issue(ctx, token.UserID, token.TenantID, token.BusinessID, token.Roles)
}

func (s *Service) CheckEmailExists(ctx context.Context, email string) (bool, error) {
	email = normalizeEmail(email)
	if email == "" {
		return false, nil
	}

	_, err := s.repo.FindByEmail(ctx, email)
	if err == nil {
		return true, nil
	}

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return false, nil
	}

	return false, err
}

func (s *Service) issue(ctx context.Context, userID, tenantID, businessID uuid.UUID, roles []string) (*AuthResponse, error) {
	// No business was requested (e.g. Clerk SSO, email OTP): scope the
	// session to the user's default business so every sign-in method ends up
	// with the same business context. Without this, the client had to guess
	// and the businessId was frequently left unset.
	role := ""

	if businessID == uuid.Nil {
		resolved, resolvedRole, err := s.defaultBusinessForUser(ctx, userID)
		if err != nil {
			// Best-effort: a user with no membership still gets a session.
			slog.ErrorContext(ctx, "failed to resolve default business for user", "user", userID, "err", err)
		} else if resolved != uuid.Nil {
			businessID = resolved
			tenantID = resolved
			role = resolvedRole

			if len(roles) == 0 {
				roles = []string{resolvedRole}
			}
		}
	}

	access, err := s.tokens.IssueAccessToken(userID, tenantID, businessID, roles)
	if err != nil {
		return nil, err
	}

	rawRefresh, refreshHash, expiresAt, err := s.tokens.NewRefreshToken()
	if err != nil {
		return nil, err
	}

	if roles == nil {
		roles = []string{}
	}

	token := &RefreshToken{UserID: userID, TenantID: tenantID, BusinessID: businessID, Roles: roles, TokenHash: refreshHash, ExpiresAt: expiresAt}
	if err := s.repo.CreateRefreshToken(ctx, token); err != nil {
		return nil, err
	}

	resp := &AuthResponse{UserID: userID, AccessToken: access, RefreshToken: rawRefresh, Role: role}

	// Best-effort profile for the client (never fails the login).
	if u, err := s.repo.FindByID(ctx, userID); err == nil && u != nil {
		resp.Email = u.Email
		resp.Name = u.Name
		resp.Image = u.Image
	}

	if businessID != uuid.Nil {
		biz := businessID
		resp.BusinessID = &biz
	}

	return resp, nil
}
