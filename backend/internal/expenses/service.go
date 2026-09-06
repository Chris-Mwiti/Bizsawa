package expenses

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"

	shareddb "github.com/Codecx-Org/FinAI/backend/internal/shared/db"
	apperrors "github.com/Codecx-Org/FinAI/backend/internal/shared/errors"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/pagination"
)

type TaxRecorder interface {
	RecordExpenseTax(ctx context.Context, businessID, sourceID uuid.UUID, taxable, amount decimal.Decimal) error
}
type Service struct {
	repo  *Repository
	taxes TaxRecorder
}

func NewService(repo *Repository, taxes TaxRecorder) *Service {
	return &Service{repo: repo, taxes: taxes}
}

type ExpenseRequest struct {
	Category          string          `json:"category"`
	Description       string          `json:"description"`
	Vendor            string          `json:"vendor"`
	Amount            decimal.Decimal `json:"amount"`
	TaxAmount         decimal.Decimal `json:"taxAmount"`
	IsRecurring       bool            `json:"isRecurring"`
	RecurringInterval string          `json:"recurringInterval"`
	SpentAt           *time.Time      `json:"spentAt"`
}

func (s *Service) WithTx(tx *gorm.DB) *Service {
	if tx == nil {
		return s
	}

	return &Service{
		repo:  s.repo.WithTx(tx),
		taxes: s.taxes,
	}
}

func (s *Service) Create(ctx context.Context, businessID, userID uuid.UUID, req ExpenseRequest) (*Expense, error) {
	if req.Category == "" {
		return nil, apperrors.ErrUnprocessable.WithMessage("expense category is required")
	}

	spent := time.Now().UTC()
	if req.SpentAt != nil {
		spent = *req.SpentAt
	}

	item := &Expense{
		BaseModel:         shareddb.BaseModel{TenantID: businessID},
		BusinessID:        businessID,
		Category:          req.Category,
		Description:       req.Description,
		Vendor:            req.Vendor,
		Amount:            req.Amount,
		TaxAmount:         req.TaxAmount,
		IsRecurring:       req.IsRecurring,
		RecurringInterval: req.RecurringInterval,
		SpentAt:           spent,
		CreatedBy:         userID,
	}

	if err := s.repo.Create(ctx, item); err != nil {
		return nil, err
	}

	if s.taxes != nil && req.TaxAmount.IsPositive() {
		_ = s.taxes.RecordExpenseTax(ctx, businessID, item.ID, req.Amount, req.TaxAmount)
	}

	_ = s.repo.DB().WithContext(ctx).Exec(`DELETE FROM analytics_snapshots WHERE business_id = ?`, businessID).Error

	return item, nil
}

func (s *Service) List(ctx context.Context, businessID uuid.UUID, page pagination.Page) ([]Expense, error) {
	return s.repo.List(ctx, businessID, page)
}

func (s *Service) Get(ctx context.Context, businessID, id uuid.UUID) (*Expense, error) {
	return s.repo.Find(ctx, businessID, id)
}

func (s *Service) Delete(ctx context.Context, businessID, id uuid.UUID) error {
	err := s.repo.Delete(ctx, businessID, id)
	if err == nil {
		_ = s.repo.DB().WithContext(ctx).Exec(`DELETE FROM analytics_snapshots WHERE business_id = ?`, businessID).Error
	}
	return err
}

func (s *Service) SummaryByCategory(ctx context.Context, businessID uuid.UUID, from, to time.Time) ([]CategorySummary, error) {
	return s.repo.Summary(ctx, businessID, from, to)
}
