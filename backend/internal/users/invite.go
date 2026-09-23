package users

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"math/big"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	apperrors "github.com/Codecx-Org/FinAI/backend/internal/shared/errors"
	shareddb "github.com/Codecx-Org/FinAI/backend/internal/shared/db"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/email"
)

const (
	inviteOTPLength = 6
	inviteExpiry    = 24 * time.Hour
	inviteMaxAttempts = 5
)

func generateInviteOTP() string {
	digits := "0123456789"
	b := make([]byte, inviteOTPLength)
	for i := range b {
		n, _ := rand.Int(rand.Reader, big.NewInt(10))
		b[i] = digits[n.Int64()]
	}
	return string(b)
}

func hashInviteOTP(otp string) string {
	h := sha256.Sum256([]byte(strings.TrimSpace(otp)))
	return hex.EncodeToString(h[:])
}

func normalizeEmailInvite(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func validInviteRole(role string) bool {
	switch role {
	case "MANAGER", "CASHIER", "VIEWER":
		return true
	default:
		return false
	}
}

// InviteByEmailRequest is the payload for owner/manager inviting via email.
type InviteByEmailRequest struct {
	Email string `json:"email"`
	Role  string `json:"role"`
}

// AcceptInviteRequest is used by invited user to redeem OTP.
type AcceptInviteRequest struct {
	BusinessID uuid.UUID `json:"businessId"`
	Email      string    `json:"email"`
	Otp        string    `json:"otp"`
	Name       string    `json:"name"` // optional for new user display name
}

// InviteService handles email invites with OTP. Depends on auth user creation and email.
type InviteService struct {
	db          *gorm.DB
	usersRepo   *Repository
	authRepo    interface {
		FindByEmail(ctx context.Context, email string) (interface{}, error)
		CreateUser(ctx context.Context, user interface{}) error
	}
	emailSender email.Sender
	// businessName resolver
	businessNameFn func(ctx context.Context, businessID uuid.UUID) string
	// token issuer for accept response
	tokenIssuer interface {
		IssueForInvite(ctx context.Context, userID, businessID uuid.UUID, role string) (access string, refresh string, err error)
	}
}

func NewInviteService(db *gorm.DB, usersRepo *Repository, emailSender email.Sender) *InviteService {
	return &InviteService{db: db, usersRepo: usersRepo, emailSender: emailSender}
}

func (s *InviteService) WithBusinessNameFn(fn func(ctx context.Context, businessID uuid.UUID) string) *InviteService {
	s.businessNameFn = fn
	return s
}

// InviteByEmail creates a pending invite and sends email with OTP + role and download instructions.
// Caller must have already verified inviter is OWNER or MANAGER (MANAGER only CASHIER).
func (s *InviteService) InviteByEmail(ctx context.Context, businessID, invitedBy uuid.UUID, req InviteByEmailRequest) (*BusinessInvite, error) {
	email := normalizeEmailInvite(req.Email)
	role := strings.ToUpper(strings.TrimSpace(req.Role))
	if email == "" || !strings.Contains(email, "@") {
		return nil, apperrors.ErrUnprocessable.WithMessage("valid email required")
	}
	if !validInviteRole(role) {
		return nil, apperrors.ErrUnprocessable.WithMessage("invalid role for invite: use MANAGER, CASHIER, VIEWER")
	}
	// check already member
	var cnt int64
	if err := s.db.WithContext(ctx).Model(&BusinessMember{}).Where("business_id = ? AND user_id IN (SELECT id FROM auth_users WHERE email = ?) AND is_active = true", businessID, email).Count(&cnt).Error; err == nil && cnt > 0 {
		return nil, apperrors.ErrUnprocessable.WithMessage("user already a member of this business")
	}
	// check pending invite exists (unique partial index will also enforce)
	var existing BusinessInvite
	if err := s.db.WithContext(ctx).Where("business_id = ? AND email = ? AND used_at IS NULL AND expires_at > ?", businessID, email, time.Now().UTC()).First(&existing).Error; err == nil {
		// refresh OTP for existing pending invite
		otp := generateInviteOTP()
		existing.OtpHash = hashInviteOTP(otp)
		existing.Role = role
		existing.ExpiresAt = time.Now().UTC().Add(inviteExpiry)
		existing.InvitedBy = invitedBy
		if err := s.db.WithContext(ctx).Save(&existing).Error; err != nil {
			return nil, err
		}
		// Also refresh auth_otps so invite code works as sign-in code
		_ = s.db.WithContext(ctx).Exec("DELETE FROM auth_otps WHERE email = ? AND type = 'sign-in' AND expires_at > NOW()", email).Error
		_ = s.db.WithContext(ctx).Exec("INSERT INTO auth_otps (id, email, otp_hash, type, expires_at, created_at) VALUES (gen_random_uuid(), ?, ?, 'sign-in', ?, NOW())", email, hashInviteOTP(otp), existing.ExpiresAt).Error
		bname := "your business"
		if s.businessNameFn != nil {
			if n := s.businessNameFn(ctx, businessID); n != "" {
				bname = n
			}
		}
		if s.emailSender != nil {
			if err := s.emailSender.SendInviteEmail(ctx, email, bname, role, otp); err != nil {
				slog.Error("invite email send failed", "email", email, "err", err)
				return nil, fmt.Errorf("failed to send invite email: %w", err)
			}
		} else {
			slog.Info("invite OTP (no sender)", "email", email, "otp", otp, "role", role)
		}
		return &existing, nil
	}
	otp := generateInviteOTP()
	invite := &BusinessInvite{
		BusinessID: businessID,
		TenantID:   businessID,
		Email:      email,
		Role:       role,
		OtpHash:    hashInviteOTP(otp),
		InvitedBy:  invitedBy,
		ExpiresAt:  time.Now().UTC().Add(inviteExpiry),
	}
	if err := s.db.WithContext(ctx).Create(invite).Error; err != nil {
		return nil, err
	}
	// Create auth OTP so invite code also works for sign-in
	_ = s.db.WithContext(ctx).Exec("DELETE FROM auth_otps WHERE email = ? AND type = 'sign-in' AND expires_at > NOW()", email).Error
	_ = s.db.WithContext(ctx).Exec("INSERT INTO auth_otps (id, email, otp_hash, type, expires_at, created_at) VALUES (gen_random_uuid(), ?, ?, 'sign-in', ?, NOW())", email, hashInviteOTP(otp), invite.ExpiresAt).Error
	bname := "your business"
	if s.businessNameFn != nil {
		if n := s.businessNameFn(ctx, businessID); n != "" {
			bname = n
		}
	}
	if s.emailSender != nil {
		if err := s.emailSender.SendInviteEmail(ctx, email, bname, role, otp); err != nil {
			slog.Error("invite email send failed", "email", email, "err", err)
			// keep invite but surface error
			return nil, fmt.Errorf("failed to send invite email: %w", err)
		}
	} else {
		slog.Info("invite OTP (no sender)", "email", email, "otp", otp, "role", role)
	}
	slog.Info("invite created", "business", businessID, "email", email, "role", role)
	return invite, nil
}

func (s *InviteService) ListInvites(ctx context.Context, businessID uuid.UUID) ([]BusinessInvite, error) {
	var invites []BusinessInvite
	err := s.db.WithContext(ctx).Where("business_id = ? AND used_at IS NULL AND expires_at > ?", businessID, time.Now().UTC()).Order("created_at DESC").Find(&invites).Error
	return invites, err
}

// AcceptInvite verifies OTP and creates membership + returns userId/role for token issuance by caller.
// It does NOT issue tokens itself — caller (auth or users handler) issues after this succeeds to avoid circular deps.
func (s *InviteService) AcceptInvite(ctx context.Context, req AcceptInviteRequest) (*BusinessInvite, uuid.UUID, string, error) {
	email := normalizeEmailInvite(req.Email)
	otp := strings.TrimSpace(req.Otp)
	businessID := req.BusinessID
	if email == "" || otp == "" || businessID == uuid.Nil {
		return nil, uuid.Nil, "", apperrors.ErrUnprocessable.WithMessage("businessId, email and otp required")
	}
	var invite BusinessInvite
	err := s.db.WithContext(ctx).Where("business_id = ? AND email = ? AND used_at IS NULL AND expires_at > ?", businessID, email, time.Now().UTC()).Order("created_at DESC").First(&invite).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, uuid.Nil, "", apperrors.ErrUnauthorized.WithMessage("invite not found or expired")
		}
		return nil, uuid.Nil, "", err
	}
	if hashInviteOTP(otp) != invite.OtpHash {
		return nil, uuid.Nil, "", apperrors.ErrUnauthorized.WithMessage("invalid invite code")
	}
	// Find or create user
	// We need to interact with auth_users table directly via raw query to avoid import cycle.
	var userID uuid.UUID
	var existingID string
	err = s.db.WithContext(ctx).Raw("SELECT id FROM auth_users WHERE email = ? LIMIT 1", email).Scan(&existingID).Error
	if err == nil && existingID != "" {
		if uid, e := uuid.Parse(existingID); e == nil {
			userID = uid
			// ensure active
			s.db.WithContext(ctx).Exec("UPDATE auth_users SET is_active = true, email_verified = true WHERE id = ?", userID)
		}
	}
	if userID == uuid.Nil {
		// create user with no password (OTP/invite user) — password_hash empty, will be set via reset flow if needed
		newID := uuid.New()
		name := strings.TrimSpace(req.Name)
		if name == "" {
			parts := strings.Split(email, "@")
			name = parts[0]
		}
		// Insert minimal auth_users row — columns per migration 000002
		err = s.db.WithContext(ctx).Exec(
			`INSERT INTO auth_users (id, email, password_hash, is_active, email_verified, provider, name, created_at, updated_at) VALUES (?, ?, '', true, true, 'invite', ?, NOW(), NOW())`,
			newID, email, name,
		).Error
		if err != nil {
			return nil, uuid.Nil, "", err
		}
		userID = newID
		// ensure subscription row if tenancy expects it — best effort, ignore error
		_ = s.db.WithContext(ctx).Exec(`INSERT INTO tenancy_subscriptions (id, user_id, plan_code, status, created_at, updated_at) VALUES (gen_random_uuid(), ?, 'free', 'active', NOW(), NOW()) ON CONFLICT DO NOTHING`, userID).Error
	}
	// check already member
	var cnt int64
	s.db.WithContext(ctx).Model(&BusinessMember{}).Where("business_id = ? AND user_id = ?", businessID, userID).Count(&cnt)
	if cnt > 0 {
		// already member — mark invite used and return
		now := time.Now().UTC()
		s.db.WithContext(ctx).Model(&invite).Update("used_at", now)
		return &invite, userID, invite.Role, nil
	}
	now := time.Now().UTC()
	member := &BusinessMember{
		TenantModel: shareddb.TenantModel{TenantID: businessID},
		BusinessID: businessID,
		UserID:     userID,
		Role:       invite.Role,
		IsActive:   true,
		InvitedBy:  invite.InvitedBy,
		InvitedAt:  invite.CreatedAt,
		JoinedAt:   &now,
	}
	if err := s.db.WithContext(ctx).Create(member).Error; err != nil {
		return nil, uuid.Nil, "", err
	}
	now2 := time.Now().UTC()
	s.db.WithContext(ctx).Model(&invite).Update("used_at", now2)
	invite.UsedAt = &now2
	return &invite, userID, invite.Role, nil
}
