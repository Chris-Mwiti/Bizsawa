package taxes

import (
	"context"
	"time"

	shareddb "github.com/Codecx-Org/FinAI/backend/internal/shared/db"
	apperrors "github.com/Codecx-Org/FinAI/backend/internal/shared/errors"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/pagination"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

type Service struct{ repo *Repository }

func NewService(repo *Repository) *Service { return &Service{repo: repo} }

type RuleRequest struct {
	Name      string          `json:"name"`
	Rate      decimal.Decimal `json:"rate"`
	Country   string          `json:"country"`
	IsDefault bool            `json:"isDefault"`
	IsActive  *bool           `json:"isActive"`
}

func (s *Service) EnsureKenyaVAT(ctx context.Context, businessID uuid.UUID) (*TaxRule, error) {
	rule, err := s.repo.DefaultRule(ctx, businessID)
	if err == nil {
		return rule, nil
	}
	rule = &TaxRule{
		BaseModel: shareddb.BaseModel{
			TenantID: businessID}, 
			BusinessID: businessID, 
			Name: "Kenya VAT", 
			Rate: decimal.NewFromFloat(0.16), 
			Country: "KE", 
			IsDefault: true, 
			IsActive: true,
		}
	return rule, s.repo.CreateRule(ctx, rule)
}


func (s *Service) CreateRule(ctx context.Context, businessID uuid.UUID, req RuleRequest) (*TaxRule, error) {
	if req.Name == "" {
		return nil, apperrors.ErrUnprocessable.WithMessage("tax rule name is required")
	}
	active := true
	if req.IsActive != nil {
		active = *req.IsActive
	}
	country := req.Country
	if country == "" {
		country = "KE"
	}
	rule := &TaxRule{
		BaseModel: shareddb.BaseModel{
			TenantID: businessID}, 
			BusinessID: businessID, 
			Name: req.Name, 
			Rate: req.Rate, 
			Country: country, 
			IsDefault: req.IsDefault, 
			IsActive: active}
	return rule, s.repo.CreateRule(ctx, rule)
}


func (s *Service) ListRules(ctx context.Context, businessID uuid.UUID, page pagination.Page) ([]TaxRule, error) {
	return s.repo.ListRules(ctx, businessID, page)
}


func (s *Service) RecordSaleTax(ctx context.Context, businessID, sourceID uuid.UUID, taxable decimal.Decimal) error {
	rule, _ := s.EnsureKenyaVAT(ctx, businessID)
	amount := taxable.Mul(rule.Rate).Round(2)
	return s.repo.InsertEntry(ctx, &TaxEntry{
		BaseModel: shareddb.BaseModel{TenantID: businessID}, 
		BusinessID: businessID, 
		SourceType: "sale", 
		SourceID: sourceID, 
		TaxRuleID: &rule.ID, 
		TaxType: "VAT_OUTPUT", 
		Taxable: taxable, 
		Amount: amount, 
		OccurredAt: time.Now().UTC()})
}


func (s *Service) RecordExpenseTax(ctx context.Context, businessID, sourceID uuid.UUID, taxable, amount decimal.Decimal) error {
	return s.repo.InsertEntry(ctx, &TaxEntry{
		BaseModel: shareddb.BaseModel{
			TenantID: businessID}, 
			BusinessID: businessID, 
			SourceType: "expense", 
			SourceID: sourceID, 
			TaxType: "VAT_INPUT", 
			Taxable: taxable, 
			Amount: amount, 
			OccurredAt: time.Now().UTC()})
}


func (s *Service) Summary(ctx context.Context, businessID uuid.UUID, from, to time.Time) ([]PeriodSummary, error) {
	return s.repo.Summary(ctx, businessID, from, to)
}
