package taxes

import (
	"context"
	"time"

	shareddb "github.com/Codecx-Org/FinAI/backend/internal/shared/db"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/pagination"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Repository struct{ db *gorm.DB }

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

func (r *Repository) CreateRule(ctx context.Context, rule *TaxRule) error {
	return r.db.WithContext(ctx).Create(rule).Error
}
func (r *Repository) ListRules(ctx context.Context, businessID uuid.UUID, page pagination.Page) ([]TaxRule, error) {
	var rules []TaxRule
	err := r.db.WithContext(ctx).Scopes(shareddb.BusinessScope(businessID)).Order("created_at DESC").Limit(page.Limit).Offset(page.Offset).Find(&rules).Error
	return rules, err
}

func (r *Repository) DefaultRule(ctx context.Context, businessID uuid.UUID) (*TaxRule, error) {
	var rule TaxRule
	err := r.db.WithContext(ctx).Scopes(shareddb.BusinessScope(businessID)).Where("is_default = true AND is_active = true").First(&rule).Error
	if err != nil {
		return nil, err
	}
	return &rule, nil
}

func (r *Repository) InsertEntry(ctx context.Context, entry *TaxEntry) error {
	return r.db.WithContext(ctx).Create(entry).Error
}

func (r *Repository) Summary(ctx context.Context, businessID uuid.UUID, from, to time.Time) ([]PeriodSummary, error) {
	var out []PeriodSummary
	err := r.db.WithContext(ctx).Model(&TaxEntry{}).Select("tax_type, COALESCE(SUM(taxable),0) AS taxable, COALESCE(SUM(amount),0) AS amount").Where("business_id = ? AND occurred_at >= ? AND occurred_at < ?", businessID, from, to).Group("tax_type").Scan(&out).Error
	return out, err
}
