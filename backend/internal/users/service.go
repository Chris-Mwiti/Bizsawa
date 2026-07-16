package users

import (
	"context"
	"errors"
	"strings"
	"time"

	shareddb "github.com/Codecx-Org/FinAI/backend/internal/shared/db"

	apperrors "github.com/Codecx-Org/FinAI/backend/internal/shared/errors"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Service struct{ repo *Repository }

func NewService(repo *Repository) *Service { return &Service{repo: repo} }

type InviteMemberRequest struct {
	UserID uuid.UUID `json:"userId"`
	Role   string    `json:"role"`
}
type UpdateRoleRequest struct {
	Role string `json:"role"`
}
type UpdateProfileRequest struct {
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
	Phone     string `json:"phone"`
	AvatarURL string `json:"avatarUrl"`
	Timezone  string `json:"timezone"`
	Language  string `json:"language"`
}

type CreateProfileRequest struct {
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
	Phone     string `json:"phone"`
	AvatarURL string `json:"avatarUrl"`
	Timezone  string `json:"timezone"`
	Language  string `json:"language"`
}

func (s *Service) AddOwner(ctx context.Context, businessID, userID uuid.UUID) error {
	now := time.Now().UTC()
	return s.repo.CreateMember(ctx, &BusinessMember{BaseModel: shareddb.BaseModel{TenantID: businessID}, BusinessID: businessID, UserID: userID, Role: "OWNER", IsActive: true, InvitedBy: userID, InvitedAt: now, JoinedAt: &now})
}

func (s *Service) InviteMember(ctx context.Context, businessID, invitedBy uuid.UUID, req InviteMemberRequest) (*BusinessMember, error) {
	if req.UserID == uuid.Nil || !validRole(req.Role) || req.Role == "OWNER" {
		return nil, apperrors.ErrUnprocessable.WithMessage("invalid member invite")
	}

	member := &BusinessMember{
		BaseModel: shareddb.BaseModel{
			TenantID: businessID,
		}, 
		BusinessID: businessID, 
		UserID: req.UserID, 
		Role: req.Role, 
		IsActive: true, 
		InvitedBy: invitedBy, 
		InvitedAt: time.Now().UTC(),
	}

	if err := s.repo.CreateMember(ctx, member); err != nil {
		return nil, err
	}
	return member, nil
}

func (s *Service) ListMembers(ctx context.Context, businessID uuid.UUID) ([]BusinessMember, error) {
	return s.repo.ListByBusiness(ctx, businessID)
}

func (s *Service) UpdateRole(ctx context.Context, businessID, memberID uuid.UUID, role string) error {
	if !validRole(role) || role == "OWNER" {
		return apperrors.ErrUnprocessable.WithMessage("invalid role")
	}
	return s.repo.UpdateRole(ctx, businessID, memberID, role)
}
func (s *Service) Deactivate(ctx context.Context, businessID, memberID uuid.UUID) error {
	return s.repo.Deactivate(ctx, businessID, memberID)
}



func (s *Service) GetOrCreateProfile(ctx context.Context, userID uuid.UUID, businessId uuid.UUID) (*UserProfile, error) {
	profile, err := s.repo.FindProfileByUserID(ctx, userID)
	if err == nil {
		return profile, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	profile = &UserProfile{
		BaseModel: shareddb.BaseModel{
			TenantID: businessId,
		}, 
		UserID: userID, 
		Timezone: "Africa/Nairobi", 
		Language: "en",
	}
	if err := s.repo.CreateProfile(ctx, profile); err != nil {
		return nil, err
	}
	return profile, nil
}

func (s *Service) CreateProfile(ctx context.Context, businessId uuid.UUID, userID uuid.UUID, req CreateProfileRequest) (*UserProfile, error) {
	profile := &UserProfile{
		BaseModel: shareddb.BaseModel{
			TenantID: businessId,
		},
		UserID: userID,
		Timezone: "Africa/Nairobi",
		FirstName: defaultString(req.FirstName, ""),
    LastName: defaultString(req.LastName, ""),
		AvatarURL: defaultString(req.AvatarURL, ""),
		Phone: defaultString(req.Phone, ""),
	}

  err := s.repo.CreateProfile(ctx, profile)

	if err != nil {
		return nil, err
	}

	return profile, nil
}

func (s *Service) UpdateProfile(ctx context.Context, userID uuid.UUID, businessId uuid.UUID,req UpdateProfileRequest) (*UserProfile, error) {
	profile, err := s.GetOrCreateProfile(ctx, userID, businessId)
	if err != nil {
		return nil, err
	}
	profile.FirstName = defaultString(strings.TrimSpace(req.FirstName), "")
	profile.LastName = strings.TrimSpace(req.LastName)
	profile.Phone = strings.TrimSpace(req.Phone)
	profile.AvatarURL = strings.TrimSpace(req.AvatarURL)
	profile.Timezone = defaultString(req.Timezone, "Africa/Nairobi")
	profile.Language = defaultString(req.Language, "en")
	return profile, s.repo.UpdateProfile(ctx, profile)
}

func validRole(role string) bool {
	switch role {
	case "OWNER", "MANAGER", "CASHIER", "VIEWER":
		return true
	default:
		return false
	}
}

func defaultString(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return strings.TrimSpace(value)
}
