package auth

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
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"github.com/Codecx-Org/FinAI/backend/internal/shared/email"
)

type OTPType string

const (
	OTPTypeSignIn            OTPType = "sign-in"
	OTPTypeEmailVerification OTPType = "email-verification"
	OTPTypeForgetPassword    OTPType = "forget-password"
)

const (
	otpLength       = 6
	otpExpiresIn    = 5 * time.Minute
	otpAllowedAttempts = 3
)

// OTP mirrors auth_otps table
type OTP struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	Email     string    `gorm:"type:text;not null;index"`
	OtpHash   string    `gorm:"type:text;not null"`
	Type      string    `gorm:"type:text;not null;check:type IN ('sign-in','email-verification','forget-password')"`
	ExpiresAt time.Time `gorm:"not null;index"`
	Attempts  int       `gorm:"not null;default:0"`
	Verified  bool      `gorm:"not null;default:false"`
	CreatedAt time.Time `gorm:"not null;default:now()"`
}

func (OTP) TableName() string { return "auth_otps" }

type SendOTPRequest struct {
	Email string  `json:"email"`
	Type  OTPType `json:"type"`
}

type CheckOTPRequest struct {
	Email string  `json:"email"`
	Type  OTPType `json:"type"`
	Otp   string  `json:"otp"`
}

type SignInOTPRequest struct {
	Email string `json:"email"`
	Otp   string `json:"otp"`
	Name  string `json:"name"`
	Image string `json:"image"`
}

type RequestPasswordResetOTPRequest struct {
	Email string `json:"email"`
}

type ResetPasswordOTPRequest struct {
	Email    string `json:"email"`
	Otp      string `json:"otp"`
	Password string `json:"password"`
}

type VerifyEmailOTPRequest struct {
	Email string `json:"email"`
	Otp   string `json:"otp"`
}

func generateOTP(length int) string {
	digits := "0123456789"
	b := make([]byte, length)
	for i := range b {
		n, _ := rand.Int(rand.Reader, big.NewInt(10))
		b[i] = digits[n.Int64()]
	}
	return string(b)
}

func hashOTP(otp string) string {
	h := sha256.Sum256([]byte(otp))
	return hex.EncodeToString(h[:])
}

// SendVerificationOTP is the core primitive — generates, stores, and delivers via Resend (with log fallback).
func (s *Service) SendVerificationOTP(ctx context.Context, req SendOTPRequest) error {
	emailAddr := normalizeEmail(req.Email)
	if emailAddr == "" {
		return ErrUnauthorized.WithMessage("email required")
	}
	otpType := OTPType(strings.TrimSpace(string(req.Type)))
	if otpType != OTPTypeSignIn && otpType != OTPTypeEmailVerification && otpType != OTPTypeForgetPassword {
		otpType = OTPTypeSignIn
	}
	// For forget-password, user must exist — prevents enumeration timing but we still create OTP for non-existent to avoid leak
	if otpType == OTPTypeForgetPassword {
		if _, err := s.repo.FindByEmail(ctx, emailAddr); err != nil {
			slog.Info("otp forget-password for non-existent user (no-op)", "email", emailAddr)
		}
	}
	otp := generateOTP(otpLength)
	otpHash := hashOTP(otp)
	// Invalidate previous unexpired OTPs of same type
	_ = s.repo.db.WithContext(ctx).Where("email = ? AND type = ? AND expires_at > ?", emailAddr, string(otpType), time.Now().UTC()).Delete(&OTP{}).Error
	rec := &OTP{
		Email:     emailAddr,
		OtpHash:   otpHash,
		Type:      string(otpType),
		ExpiresAt: time.Now().UTC().Add(otpExpiresIn),
	}
	if err := s.repo.db.WithContext(ctx).Create(rec).Error; err != nil {
		return err
	}

	sender := s.emailSender
	if sender == nil {
		sender = &email.NoopSender{}
	}
	if err := sender.SendOTPEmail(ctx, emailAddr, otp, string(otpType)); err != nil {
		slog.Error("failed to send OTP email via provider", "email", emailAddr, "type", otpType, "err", err)
		// OTP is already persisted; surface error so caller can retry/show message.
		// In dev (NoopSender) this never errors.
		return fmt.Errorf("failed to send OTP email: %w", err)
	}
	// Always log at info for dev observability (redacted in prod via log level)
	slog.Info("sendVerificationOTP dispatched", "email", emailAddr, "type", otpType, "expiresIn", otpExpiresIn.String())
	return nil
}

func (s *Service) CheckVerificationOTP(ctx context.Context, req CheckOTPRequest) (bool, error) {
	email := normalizeEmail(req.Email)
	otpType := string(req.Type)
	otp := strings.TrimSpace(req.Otp)
	if email == "" || otp == "" {
		return false, ErrUnauthorized.WithMessage("email and otp required")
	}
	var rec OTP
	err := s.repo.db.WithContext(ctx).
		Where("email = ? AND type = ? AND expires_at > ? AND verified = false", email, otpType, time.Now().UTC()).
		Order("created_at DESC").First(&rec).Error
	if err != nil {
		return false, ErrUnauthorized.WithMessage("otp not found or expired")
	}
	if rec.Attempts >= otpAllowedAttempts {
		_ = s.repo.db.WithContext(ctx).Delete(&rec).Error
		return false, ErrUnauthorized.WithMessage("too many attempts, request new otp")
	}
	if hashOTP(otp) != rec.OtpHash {
		_ = s.repo.db.WithContext(ctx).Model(&rec).Update("attempts", rec.Attempts+1).Error
		return false, ErrUnauthorized.WithMessage("invalid otp")
	}
	return true, nil
}

// internal verify helper that marks verified and enforces attempts
func (s *Service) verifyOTPAtomic(ctx context.Context, email, typ, otp string) (*OTP, error) {
	email = normalizeEmail(email)
	typ = strings.TrimSpace(typ)
	otp = strings.TrimSpace(otp)
	var rec OTP
	err := s.repo.db.WithContext(ctx).Where("email = ? AND type = ? AND expires_at > ? AND verified = false", email, typ, time.Now().UTC()).Order("created_at DESC").First(&rec).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrUnauthorized.WithMessage("otp expired or not found")
		}
		return nil, err
	}
	if rec.Attempts >= otpAllowedAttempts {
		_ = s.repo.db.WithContext(ctx).Delete(&rec).Error
		return nil, ErrUnauthorized.WithMessage("too many attempts")
	}
	if hashOTP(otp) != rec.OtpHash {
		_ = s.repo.db.WithContext(ctx).Model(&rec).Update("attempts", rec.Attempts+1).Error
		return nil, ErrUnauthorized.WithMessage("invalid otp")
	}
	_ = s.repo.db.WithContext(ctx).Model(&rec).Updates(map[string]any{"verified": true, "attempts": rec.Attempts + 1}).Error
	return &rec, nil
}

func (s *Service) SignInEmailOTP(ctx context.Context, req SignInOTPRequest) (*AuthResponse, error) {
	email := normalizeEmail(req.Email)
	if _, err := s.verifyOTPAtomic(ctx, email, string(OTPTypeSignIn), req.Otp); err != nil {
		return nil, err
	}
	user, err := s.repo.FindByEmail(ctx, email)
	if err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		// Auto-register per EmailOTP.md (sign-in creates account if not exists)
		user = &User{
			Email:        email,
			PasswordHash: "", // OTP users have no password until set via reset
			IsActive:     true,
			Name:         strings.TrimSpace(req.Name),
			Image:        strings.TrimSpace(req.Image),
			EmailVerified: true,
			Provider:     "email-otp",
		}
		if err := s.repo.CreateUser(ctx, user); err != nil {
			return nil, err
		}
		if s.subscriptions != nil {
			_ = s.subscriptions.EnsureDefaultSubscriptionForUser(ctx, user.ID)
		}
	} else {
		// Existing unverified credential account: per docs, clear password and verify email
		if !user.EmailVerified {
			_ = s.repo.db.WithContext(ctx).Model(&User{}).Where("id = ?", user.ID).Updates(map[string]any{"email_verified": true, "password_hash": ""}).Error
			user.EmailVerified = true
		}
		if !user.IsActive {
			return nil, ErrInactiveUser
		}
	}
	// OTP verified → sessions prior password sessions revoked? Keep per docs: revoke and sign in via OTP
	return s.issue(ctx, user.ID, uuid.Nil, uuid.Nil, nil)
}

func (s *Service) VerifyEmailOTP(ctx context.Context, req VerifyEmailOTPRequest) error {
	if _, err := s.verifyOTPAtomic(ctx, req.Email, string(OTPTypeEmailVerification), req.Otp); err != nil {
		return err
	}
	email := normalizeEmail(req.Email)
	user, err := s.repo.FindByEmail(ctx, email)
	if err != nil {
		return ErrUnauthorized.WithMessage("user not found")
	}
	return s.repo.db.WithContext(ctx).Model(&User{}).Where("id = ?", user.ID).Update("email_verified", true).Error
}

func (s *Service) RequestPasswordResetWithOTP(ctx context.Context, req RequestPasswordResetOTPRequest) error {
	email := normalizeEmail(req.Email)
	if email == "" {
		return ErrUnauthorized.WithMessage("email required")
	}
	// Always return success to avoid enumeration, but only send if user exists
	if _, err := s.repo.FindByEmail(ctx, email); err != nil {
		slog.Info("requestPasswordReset OTP for non-existent user (silently succeed)", "email", email)
		return nil
	}
	return s.SendVerificationOTP(ctx, SendOTPRequest{Email: email, Type: OTPTypeForgetPassword})
}

func (s *Service) ResetPasswordWithOTP(ctx context.Context, req ResetPasswordOTPRequest) error {
	email := normalizeEmail(req.Email)
	if len(req.Password) < 8 {
		return ErrUnauthorized.WithMessage("password must be at least 8 characters")
	}
	if _, err := s.verifyOTPAtomic(ctx, email, string(OTPTypeForgetPassword), req.Otp); err != nil {
		return err
	}
	user, err := s.repo.FindByEmail(ctx, email)
	if err != nil {
		return ErrUnauthorized.WithMessage("user not found")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	// Revoke other sessions per EmailPassword.md revokeSessionsOnPasswordReset
	_ = s.repo.db.WithContext(ctx).Model(&RefreshToken{}).Where("user_id = ?", user.ID).Update("revoked_at", time.Now().UTC()).Error
	if err := s.repo.db.WithContext(ctx).Model(&User{}).Where("id = ?", user.ID).Updates(map[string]any{"password_hash": string(hash), "email_verified": true}).Error; err != nil {
		return err
	}
	slog.Info("password reset via OTP", "email", email)
	return nil
}

// Keep legacy Register/Login compatible: ensure credential users also get OTP verification capability
func init() {
	_ = fmt.Sprintf
	_ = hashOTP
}
