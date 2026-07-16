package auth

import (
	"context"
	"errors"

	"github.com/Codecx-Org/FinAI/backend/internal/shared/authz"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
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
}

func NewService(repo *Repository, tokens *TokenService, memberships MembershipResolver, subscriptions SubscriptionProvisioner) *Service {
	return &Service{
		repo: repo, 
		tokens: tokens, 
		memberships: memberships, 
		subscriptions: subscriptions,
	}
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

func (s *Service) issue(ctx context.Context, userID, tenantID, businessID uuid.UUID, roles []string) (*AuthResponse, error) {
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
	return &AuthResponse{UserID: userID, AccessToken: access, RefreshToken: rawRefresh}, nil
}
