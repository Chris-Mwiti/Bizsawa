package analytics

import (
	"context"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// Service orchestrates the pre-computation and retrieval of analytics.
type Service struct {
	repo   *Repository
	logger *slog.Logger
}

func NewService(repo *Repository, logger *slog.Logger) *Service {
	if logger == nil {
		logger = slog.Default()
	}

	return &Service{repo: repo, logger: logger}
}

// Compute builds a full Snapshot for a business and timeframe and persists it.
func (s *Service) Compute(ctx context.Context, businessID uuid.UUID, tf Timeframe) (*Snapshot, error) {
	if !tf.Valid() {
		return nil, errInvalidTimeframe()
	}

	now := time.Now().UTC()

	revenue, err := s.repo.RevenueSeries(ctx, businessID, tf, now)
	if err != nil {
		return nil, err
	}

	var totalRev decimal.Decimal

	var txns int

	for _, r := range revenue {
		totalRev = totalRev.Add(r.Revenue)
		txns += r.Transactions
	}

	profit, err := s.repo.ProfitSeries(ctx, businessID, tf, now)
	if err != nil {
		return nil, err
	}

	var totalProfit decimal.Decimal

	var marginSum float64

	for _, p := range profit {
		totalProfit = totalProfit.Add(p.Profit)
		marginSum += p.Margin
	}

	avgMargin := 0.0
	if len(profit) > 0 {
		avgMargin = marginSum / float64(len(profit))
	}

	categories, err := s.repo.CategorySeries(ctx, businessID, tf, now)
	if err != nil {
		return nil, err
	}

	topProducts, err := s.repo.TopProducts(ctx, businessID, tf, now, 5)
	if err != nil {
		return nil, err
	}

	segments, err := s.repo.CustomerSegments(ctx, businessID)
	if err != nil {
		return nil, err
	}

	ltv, err := s.repo.CustomerLTV(ctx, businessID)
	if err != nil {
		ltv = decimal.Zero
	}

	expenses, err := s.repo.ExpenseBreakdown(ctx, businessID, tf, now)
	if err != nil {
		return nil, err
	}

	cashFlow, err := s.repo.CashFlowSeries(ctx, businessID, tf, now)
	if err != nil {
		return nil, err
	}

	velocity, err := s.repo.SalesVelocity(ctx, businessID, tf, now)
	if err != nil {
		velocity = &SalesVelocityDataPoint{}
	}

	snap := &Snapshot{
		BusinessID: businessID,
		Timeframe:  tf,
		Revenue: &RevenueSummary{
			Data:         revenue,
			TotalRevenue: totalRev,
			Transactions: txns,
			GrowthRate:   0,
		},
		Profit: &ProfitSummary{
			Data:        profit,
			TotalProfit: totalProfit,
			AvgMargin:   avgMargin,
		},
		Categories:  categories,
		TopProducts: topProducts,
		Customers: &CustomerSummary{
			Segments: segments,
			LTV:      ltv,
		},
		Expenses:      expenses,
		CashFlow:      cashFlow,
		SalesVelocity: velocity,
		GeneratedAt:   now,
	}

	if err := s.repo.UpsertSnapshot(ctx, snap); err != nil {
		return nil, err
	}

	return snap, nil
}

// Get returns the latest pre-computed snapshot, computing it on-demand if
// none exists yet.
func (s *Service) Get(ctx context.Context, businessID uuid.UUID, tf Timeframe) (*Snapshot, error) {
	if !tf.Valid() {
		return nil, errInvalidTimeframe()
	}

	snap, err := s.repo.FindSnapshot(ctx, businessID, tf)
	if err != nil {
		// Fall back to computing on the fly so a first request still succeeds.
		return s.Compute(ctx, businessID, tf)
	}

	return snap, nil
}
