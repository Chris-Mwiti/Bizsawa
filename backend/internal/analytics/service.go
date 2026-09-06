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
	revenue = fillRevenueSeries(revenue, tf, now)

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
	profit = fillProfitSeries(profit, tf, now)

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
	cashFlow = fillCashFlowSeries(cashFlow, tf, now)

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

func ttlFor(tf Timeframe) time.Duration {
	switch tf {
	case TimeframeDay:
		return 30 * time.Second
	case TimeframeWeek:
		return 60 * time.Second
	case TimeframeMonth:
		return 5 * time.Minute
	case TimeframeYear:
		return 15 * time.Minute
	default:
		return 60 * time.Second
	}
}

func isStale(snap *Snapshot, now time.Time) bool {
	if snap == nil {
		return true
	}
	return now.Sub(snap.GeneratedAt) > ttlFor(snap.Timeframe)
}

// fill helpers ensure every expected bucket appears, injecting zeros for missing days/hours.
func fillRevenueSeries(rows []RevenueDataPoint, tf Timeframe, now time.Time) []RevenueDataPoint {
	w := resolveWindow(tf, now)
	m := map[string]RevenueDataPoint{}
	for _, r := range rows {
		// normalize bucket key to RFC3339 truncation as stored
		m[r.Date] = r
	}
	buckets := expectedBuckets(w, tf, now)
	out := make([]RevenueDataPoint, 0, len(buckets))
	for _, b := range buckets {
		if v, ok := m[b]; ok {
			out = append(out, v)
		} else {
			// try truncated match (DB returns timestamp with tz, buckets are canonical)
			found := false
			for k, v := range m {
				if sameBucket(k, b, tf) {
					out = append(out, RevenueDataPoint{Date: b, Revenue: v.Revenue, Transactions: v.Transactions})
					found = true
					break
				}
			}
			if !found {
				out = append(out, RevenueDataPoint{Date: b, Revenue: decimal.Zero, Transactions: 0})
			}
		}
	}
	return out
}

func fillProfitSeries(rows []ProfitDataPoint, tf Timeframe, now time.Time) []ProfitDataPoint {
	w := resolveWindow(tf, now)
	m := map[string]ProfitDataPoint{}
	for _, r := range rows {
		m[r.Date] = r
	}
	buckets := expectedBuckets(w, tf, now)
	out := make([]ProfitDataPoint, 0, len(buckets))
	for _, b := range buckets {
		if v, ok := m[b]; ok {
			out = append(out, ProfitDataPoint{Date: b, Revenue: v.Revenue, Expense: v.Expense, Profit: v.Profit, Margin: v.Margin})
			continue
		}
		found := false
		for k, v := range m {
			if sameBucket(k, b, tf) {
				out = append(out, ProfitDataPoint{Date: b, Revenue: v.Revenue, Expense: v.Expense, Profit: v.Profit, Margin: v.Margin})
				found = true
				break
			}
		}
		if !found {
			out = append(out, ProfitDataPoint{Date: b, Revenue: decimal.Zero, Expense: decimal.Zero, Profit: decimal.Zero, Margin: 0})
		}
	}
	return out
}

func fillCashFlowSeries(rows []CashFlowDataPoint, tf Timeframe, now time.Time) []CashFlowDataPoint {
	w := resolveWindow(tf, now)
	m := map[string]CashFlowDataPoint{}
	for _, r := range rows {
		m[r.Date] = r
	}
	buckets := expectedBuckets(w, tf, now)
	out := make([]CashFlowDataPoint, 0, len(buckets))
	for _, b := range buckets {
		if v, ok := m[b]; ok {
			out = append(out, CashFlowDataPoint{Date: b, Inflow: v.Inflow, Outflow: v.Outflow, NetFlow: v.NetFlow})
			continue
		}
		found := false
		for k, v := range m {
			if sameBucket(k, b, tf) {
				out = append(out, CashFlowDataPoint{Date: b, Inflow: v.Inflow, Outflow: v.Outflow, NetFlow: v.NetFlow})
				found = true
				break
			}
		}
		if !found {
			out = append(out, CashFlowDataPoint{Date: b, Inflow: decimal.Zero, Outflow: decimal.Zero, NetFlow: decimal.Zero})
		}
	}
	return out
}

func sameBucket(a, b string, tf Timeframe) bool {
	pa, err1 := time.Parse(time.RFC3339, a)
	pb, err2 := time.Parse(time.RFC3339, b)
	if err1 != nil || err2 != nil {
		// fallback string prefix
		if len(a) >= 10 && len(b) >= 10 {
			return a[:10] == b[:10]
		}
		return a == b
	}
	if tf == TimeframeDay {
		return pa.Truncate(time.Hour).Equal(pb.Truncate(time.Hour))
	}
	if tf == TimeframeYear {
		return pa.Year() == pb.Year() && pa.Month() == pb.Month()
	}
	return pa.Year() == pb.Year() && pa.Month() == pb.Month() && pa.Day() == pb.Day()
}

func expectedBuckets(w window, tf Timeframe, now time.Time) []string {
	var out []string
	switch tf {
	case TimeframeDay:
		// 24 hourly buckets ending now
		start := now.Truncate(time.Hour).Add(-23 * time.Hour)
		for i := 0; i < 24; i++ {
			t := start.Add(time.Duration(i) * time.Hour)
			out = append(out, t.Format(time.RFC3339))
		}
	case TimeframeWeek:
		// 7 daily buckets inclusive of today
		day := time.Date(now.UTC().Year(), now.UTC().Month(), now.UTC().Day(), 0, 0, 0, 0, time.UTC)
		for i := 6; i >= 0; i-- {
			t := day.AddDate(0, 0, -i)
			out = append(out, t.Format(time.RFC3339))
		}
	case TimeframeMonth:
		day := time.Date(now.UTC().Year(), now.UTC().Month(), now.UTC().Day(), 0, 0, 0, 0, time.UTC)
		for i := 29; i >= 0; i-- {
			t := day.AddDate(0, 0, -i)
			out = append(out, t.Format(time.RFC3339))
		}
	case TimeframeYear:
		base := time.Date(now.UTC().Year(), now.UTC().Month(), 1, 0, 0, 0, 0, time.UTC)
		for i := 11; i >= 0; i-- {
			t := base.AddDate(0, -i, 0)
			out = append(out, t.Format(time.RFC3339))
		}
	default:
		_ = w
	}
	return out
}

// Get returns the latest pre-computed snapshot, computing it on-demand if
// none exists yet or if stale (TTL). Stale snapshots are recomputed synchronously
// so insights reflect recent sales/expenses without waiting for background jobs.
func (s *Service) Get(ctx context.Context, businessID uuid.UUID, tf Timeframe) (*Snapshot, error) {
	if !tf.Valid() {
		return nil, errInvalidTimeframe()
	}

	snap, err := s.repo.FindSnapshot(ctx, businessID, tf)
	if err != nil {
		// Fall back to computing on the fly so a first request still succeeds.
		return s.Compute(ctx, businessID, tf)
	}

	if isStale(snap, time.Now().UTC()) {
		fresh, err2 := s.Compute(ctx, businessID, tf)
		if err2 == nil {
			return fresh, nil
		}
		s.logger.WarnContext(ctx, "[ANALYTICS]-stale recompute failed, serving stale snapshot", "err", err2, "businessID", businessID.String(), "timeframe", string(tf))
	}

	return snap, nil
}
