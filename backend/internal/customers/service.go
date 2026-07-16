package customers

import (
	"context"
	"strings"

	shareddb "github.com/Codecx-Org/FinAI/backend/internal/shared/db"
	apperrors "github.com/Codecx-Org/FinAI/backend/internal/shared/errors"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/pagination"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

type Service struct{ repo *Repository }

func NewService(repo *Repository) *Service { return &Service{repo: repo} }

type CustomerRequest struct {
	Name          string          `json:"name"`
	Phone         string          `json:"phone"`
	Email         string          `json:"email"`
	Address       string          `json:"address"`
	Tags          []string        `json:"tags"`
	Notes         string          `json:"notes"`
	LoyaltyPoints int             `json:"loyaltyPoints"`
	TotalSpend    decimal.Decimal `json:"totalSpend"`
}

func (s *Service) Create(ctx context.Context, businessID uuid.UUID, req CustomerRequest) (*Customer, error) {
	customer, err := customerFromRequest(businessID, req)
	if err != nil {
		return nil, err
	}
	if err := s.repo.Create(ctx, customer); err != nil {
		return nil, err
	}
	return customer, nil
}

func (s *Service) List(ctx context.Context, businessID uuid.UUID, page pagination.Page) ([]Customer, error) {
	return s.repo.List(ctx, businessID, page)
}

func (s *Service) Get(ctx context.Context, businessID, customerID uuid.UUID) (*Customer, error) {
	return s.repo.Find(ctx, businessID, customerID)
}

func (s *Service) Update(ctx context.Context, businessID, customerID uuid.UUID, req CustomerRequest) (*Customer, error) {
	customer, err := s.repo.Find(ctx, businessID, customerID)
	if err != nil {
		return nil, err
	}
	updated, err := customerFromRequest(businessID, req)
	if err != nil {
		return nil, err
	}
	customer.Name = updated.Name
	customer.Phone = updated.Phone
	customer.Email = updated.Email
	customer.Address = updated.Address
	customer.Tags = updated.Tags
	customer.Notes = updated.Notes
	customer.LoyaltyPoints = updated.LoyaltyPoints
	customer.TotalSpend = updated.TotalSpend
	if err := s.repo.Update(ctx, customer); err != nil {
		return nil, err
	}
	return customer, nil
}

func (s *Service) Delete(ctx context.Context, businessID, customerID uuid.UUID) error {
	return s.repo.Delete(ctx, businessID, customerID)
}

func (s *Service) GetTopCustomers(ctx context.Context, businessID uuid.UUID, limit int) ([]Customer, error) {
	if limit <= 0 || limit > 100 {
		limit = 10
	}
	return s.repo.TopCustomers(ctx, businessID, limit)
}

func (s *Service) GetCustomerPurchaseHistory(ctx context.Context, businessID, customerID uuid.UUID) ([]PurchaseHistoryEntry, error) {
	if _, err := s.repo.Find(ctx, businessID, customerID); err != nil {
		return nil, err
	}
	return []PurchaseHistoryEntry{}, nil
}

func customerFromRequest(businessID uuid.UUID, req CustomerRequest) (*Customer, error) {
	if strings.TrimSpace(req.Name) == "" {
		return nil, apperrors.ErrUnprocessable.WithMessage("customer name is required")
	}
	tags := make([]string, 0, len(req.Tags))
	for _, tag := range req.Tags {
		trimmed := strings.TrimSpace(tag)
		if trimmed != "" {
			tags = append(tags, trimmed)
		}
	}
	return &Customer{BaseModel: shareddb.BaseModel{TenantID: businessID}, BusinessID: businessID, Name: strings.TrimSpace(req.Name), Phone: strings.TrimSpace(req.Phone), Email: strings.TrimSpace(req.Email), Address: strings.TrimSpace(req.Address), Tags: tags, Notes: strings.TrimSpace(req.Notes), LoyaltyPoints: req.LoyaltyPoints, TotalSpend: req.TotalSpend}, nil
}
