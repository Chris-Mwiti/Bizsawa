package business

import (
	"context"
	"regexp"
	"strings"

	sharedcrypto "github.com/Codecx-Org/FinAI/backend/internal/shared/crypto"
	apperrors "github.com/Codecx-Org/FinAI/backend/internal/shared/errors"
	"github.com/google/uuid"
)

type Service struct {
	repo    *Repository
	guard   BusinessLimitEnforcer
	members MemberWriter
	crypto  *sharedcrypto.Manager
}

func NewService(repo *Repository, guard BusinessLimitEnforcer, members MemberWriter, crypto *sharedcrypto.Manager) *Service {
	return &Service{repo: repo, guard: guard, members: members, crypto: crypto}
}

type CreateBusinessRequest struct {
	Name             string `json:"name"`
	Slug             string `json:"slug"`
	Currency         string `json:"currency"`
	Timezone         string `json:"timezone"`
	TaxPIN           string `json:"taxPin"`
	MpesaPaymentType string `json:"mpesaPaymentType"`
	MpesaShortcode   string `json:"mpesaShortcode"`
	Phone            string `json:"phone"`
	Email            string `json:"email"`
	Address          string `json:"address"`
}

type UpdateBusinessRequest struct {
	Name             string `json:"name"`
	TaxPIN           string `json:"taxPin"`
	MpesaPaymentType string `json:"mpesaPaymentType"`
	MpesaShortcode   string `json:"mpesaShortcode"`
	Phone            string `json:"phone"`
	Email            string `json:"email"`
	Address          string `json:"address"`
}

func (s *Service) CreateBusiness(ctx context.Context, userID uuid.UUID, req CreateBusinessRequest) (*Business, error) {
	if strings.TrimSpace(req.Name) == "" {
		return nil, apperrors.ErrUnprocessable.WithMessage("business name is required")
	}
	if s.guard != nil {
		if err := s.guard.EnforceBusinessLimit(ctx, userID); err != nil {
			return nil, err
		}
	}

	biz := &Business{
		OwnerID:  userID,
		Name:     strings.TrimSpace(req.Name),
		Slug:     slugOrDefault(req.Slug, req.Name),
		Currency: defaultString(req.Currency, "KES"),
		Timezone: defaultString(req.Timezone, "Africa/Nairobi"),
		TaxPIN:   req.TaxPIN,
		Phone:    req.Phone,
		Email:    req.Email,
		Address:  req.Address,
	}
	if err := s.applyMpesaSettings(biz, req.MpesaPaymentType, req.MpesaShortcode); err != nil {
		return nil, err
	}
	if err := s.repo.Create(ctx, biz); err != nil {
		return nil, err
	}
	if s.members != nil {
		if err := s.members.AddOwner(ctx, biz.ID, userID); err != nil {
			return nil, err
		}
	}
	markMpesaConfigured(biz)
	return biz, nil
}

func (s *Service) ListBusinesses(ctx context.Context, userID uuid.UUID) ([]Business, error) {
	businesses, err := s.repo.ListByUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	for i := range businesses {
		markMpesaConfigured(&businesses[i])
	}
	return businesses, nil
}

func (s *Service) GetBusiness(ctx context.Context, businessID, userID uuid.UUID) (*Business, error) {
	biz, err := s.repo.FindForUser(ctx, businessID, userID)
	if err != nil {
		return nil, err
	}
	markMpesaConfigured(biz)
	return biz, nil
}

func (s *Service) UpdateBusiness(ctx context.Context, businessID, userID uuid.UUID, req UpdateBusinessRequest) (*Business, error) {
	biz, err := s.repo.FindForUser(ctx, businessID, userID)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.Name) != "" {
		biz.Name = strings.TrimSpace(req.Name)
	}

	if strings.TrimSpace(req.TaxPIN) != "" {
		biz.Name = strings.TrimSpace(req.TaxPIN)
	}

	if strings.TrimSpace(req.MpesaShortcode) != "" {
		if err := s.applyMpesaSettings(biz, req.MpesaPaymentType, req.MpesaShortcode); err != nil {
			return nil, err
		}
	}

	if strings.TrimSpace(req.Phone) != "" {
		biz.Phone = strings.TrimSpace(req.Phone)
	}
	if strings.TrimSpace(req.Email) != "" {
		biz.Email = strings.TrimSpace(req.Email)
	}
	if strings.TrimSpace(req.Address) != "" {
		biz.Address = strings.TrimSpace(req.Address)
	}

	if err := s.repo.Update(ctx, biz); err != nil {
		return nil, err
	}
	markMpesaConfigured(biz)
	return biz, nil
}

func (s *Service) DeleteBusiness(ctx context.Context, businessID, userID uuid.UUID) error {
	return s.repo.DeleteForOwner(ctx, businessID, userID)
}

func slugOrDefault(slug, name string) string {
	if strings.TrimSpace(slug) == "" {
		slug = name
	}
	slug = strings.ToLower(strings.TrimSpace(slug))
	slug = regexp.MustCompile(`[^a-z0-9]+`).ReplaceAllString(slug, "-")
	return strings.Trim(slug, "-")
}

func defaultString(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return strings.TrimSpace(value)
}

func (s *Service) applyMpesaSettings(biz *Business, paymentType, shortcode string) error {
	paymentType = strings.TrimSpace(strings.ToLower(paymentType))
	shortcode = strings.TrimSpace(shortcode)
	if paymentType == "" {
		biz.MpesaPaymentType = ""
		biz.MpesaShortcodeEnc = ""
		biz.MpesaShortcodeIndex = ""
		return nil
	}
	if !validMpesaPaymentType(paymentType) {
		return apperrors.ErrUnprocessable.WithMessage("invalid mpesa payment type")
	}
	if shortcode == "" {
		return apperrors.ErrUnprocessable.WithMessage("mpesa shortcode is required for this payment type")
	}
	if s.crypto == nil {
		return apperrors.ErrInternal.WithMessage("crypto manager is not configured")
	}
	encrypted, err := s.crypto.Encrypt(shortcode)
	if err != nil {
		return err
	}
	biz.MpesaPaymentType = paymentType
	biz.MpesaShortcodeEnc = encrypted
	biz.MpesaShortcodeIndex = s.crypto.BlindIndex(shortcode)
	return nil
}

func validMpesaPaymentType(paymentType string) bool {
	switch paymentType {
	case "paybill", "pochi_biashara", "buy_goods":
		return true
	default:
		return false
	}
}

func markMpesaConfigured(biz *Business) {
	biz.MpesaShortcodeConfigured = biz.MpesaShortcodeEnc != ""
}
