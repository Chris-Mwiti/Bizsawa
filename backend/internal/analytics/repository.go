package analytics

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"

	shareddb "github.com/Codecx-Org/FinAI/backend/internal/shared/db"
	apperrors "github.com/Codecx-Org/FinAI/backend/internal/shared/errors"
)

type Repository struct{ db *gorm.DB }

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

func (r *Repository) WithTx(tx *gorm.DB) *Repository {
	if tx == nil {
		return r
	}

	return &Repository{db: tx}
}

// window holds the lower time boundary and the SQL bucket expression.
type window struct {
	lower      time.Time
	bucketExpr string
}

func resolveWindow(tf Timeframe, now time.Time) window {
	day := time.Date(now.UTC().Year(), now.UTC().Month(), now.UTC().Day(), 0, 0, 0, 0, time.UTC)

	switch tf {
	case TimeframeDay:
		return window{lower: now.Add(-24 * time.Hour), bucketExpr: "DATE_TRUNC('hour', sold_at)"}
	case TimeframeWeek:
		return window{lower: day.AddDate(0, 0, -7), bucketExpr: "DATE_TRUNC('day', sold_at)"}
	case TimeframeMonth:
		return window{lower: day.AddDate(0, 0, -30), bucketExpr: "DATE_TRUNC('day', sold_at)"}
	case TimeframeYear:
		return window{lower: day.AddDate(-1, 0, 0), bucketExpr: "DATE_TRUNC('month', sold_at)"}
	default:
		return window{lower: day.AddDate(0, 0, -7), bucketExpr: "DATE_TRUNC('day', sold_at)"}
	}
}

func decFromString(s string) decimal.Decimal {
	d, err := decimal.NewFromString(s)
	if err != nil {
		return decimal.Zero
	}

	return d
}

func decFromFloat(f float64) decimal.Decimal {
	return decimal.NewFromFloat(f).Round(2)
}

// replaceSoldAt adapts a sales bucket expression for the expenses table,
// whose timestamp column is spent_at (and does not differentiate day/hour).
func replaceSoldAt(expr string) string {
	switch expr {
	case "DATE_TRUNC('hour', sold_at)":
		return "DATE_TRUNC('hour', spent_at)"
	case "DATE_TRUNC('month', sold_at)":
		return "DATE_TRUNC('month', spent_at)"
	default:
		return "DATE_TRUNC('day', spent_at)"
	}
}

type revenueRow struct {
	Bucket       string `json:"bucket"`
	Revenue      string `json:"revenue"`
	Transactions int    `json:"transactions"`
}

// RevenueSeries aggregates sales into time buckets.
func (r *Repository) RevenueSeries(ctx context.Context, businessID uuid.UUID, tf Timeframe, now time.Time) ([]RevenueDataPoint, error) {
	w := resolveWindow(tf, now)

	var rows []revenueRow

	err := r.db.WithContext(ctx).Raw(
		`SELECT `+w.bucketExpr+` AS bucket, COALESCE(SUM(total),0)::text AS revenue, COUNT(*) AS transactions
		 FROM sales
		 WHERE business_id = ? AND sold_at >= ? AND status <> 'void'
		 GROUP BY bucket ORDER BY bucket ASC`,
		businessID, w.lower,
	).Scan(&rows).Error

	if err != nil {
		return nil, err
	}

	out := make([]RevenueDataPoint, 0, len(rows))
	for _, row := range rows {
		out = append(out, RevenueDataPoint{
			Date:         row.Bucket,
			Revenue:      decFromString(row.Revenue),
			Transactions: row.Transactions,
		})
	}

	return out, nil
}

type profitRow struct {
	Bucket  string `json:"bucket"`
	Revenue string `json:"revenue"`
	Expense string `json:"expense"`
}

// ProfitSeries joins revenue and expense buckets by date.
func (r *Repository) ProfitSeries(ctx context.Context, businessID uuid.UUID, tf Timeframe, now time.Time) ([]ProfitDataPoint, error) {
	w := resolveWindow(tf, now)
	expenseBucket := replaceSoldAt(w.bucketExpr)

	var rows []profitRow

	err := r.db.WithContext(ctx).Raw(
		`SELECT COALESCE(s.bucket, e.bucket) AS bucket,
		        COALESCE(s.revenue, 0) AS revenue,
		        COALESCE(e.expense, 0) AS expense
		 FROM (
		     SELECT `+w.bucketExpr+` AS bucket, SUM(total) AS revenue
		     FROM sales
		     WHERE business_id = ? AND sold_at >= ? AND status <> 'void'
		     GROUP BY bucket
		 ) s
		 FULL OUTER JOIN (
		     SELECT `+expenseBucket+` AS bucket, SUM(amount) AS expense
		     FROM expenses
		     WHERE business_id = ? AND spent_at >= ?
		     GROUP BY bucket
		 ) e ON s.bucket = e.bucket
		 ORDER BY bucket ASC`,
		businessID, w.lower, businessID, w.lower,
	).Scan(&rows).Error

	if err != nil {
		return nil, err
	}

	out := make([]ProfitDataPoint, 0, len(rows))

	for _, row := range rows {
		revenue := decFromString(row.Revenue)
		expense := decFromString(row.Expense)
		profit := revenue.Sub(expense)
		margin := 0.0

		if revenue.IsPositive() {
			margin, _ = profit.Div(revenue).Float64()
			margin *= 100
		}

		out = append(out, ProfitDataPoint{
			Date:    row.Bucket,
			Revenue: revenue,
			Expense: expense,
			Profit:  profit,
			Margin:  margin,
		})
	}

	return out, nil
}

// CategorySeries aggregates revenue by product category.
func (r *Repository) CategorySeries(ctx context.Context, businessID uuid.UUID, tf Timeframe, now time.Time) ([]CategoryDataPoint, error) {
	w := resolveWindow(tf, now)

	type catRow struct {
		Category string `json:"category"`
		Revenue  string `json:"revenue"`
	}

	var rows []catRow

	err := r.db.WithContext(ctx).Raw(
		`SELECT COALESCE(p.category, 'Uncategorized') AS category, COALESCE(SUM(sl.line_total),0)::text AS revenue
		 FROM sale_lines sl
		 JOIN sales s ON s.id = sl.sale_id AND s.status <> 'void'
		 LEFT JOIN products p ON p.id = sl.product_id
		 WHERE sl.business_id = ? AND s.sold_at >= ?
		 GROUP BY category ORDER BY revenue DESC`,
		businessID, w.lower,
	).Scan(&rows).Error

	if err != nil {
		return nil, err
	}

	out := make([]CategoryDataPoint, 0, len(rows))

	var total float64

	for _, row := range rows {
		rev := decFromString(row.Revenue)
		f, _ := rev.Float64()
		total += f

		out = append(out, CategoryDataPoint{
			Name:       row.Category,
			Revenue:    rev,
			Percentage: 0,
			Trend:      "stable",
		})
	}

	for i := range out {
		f, _ := out[i].Revenue.Float64()
		if total > 0 {
			out[i].Percentage = f / total * 100
		}
	}

	return out, nil
}

// TopProducts returns best-selling products by revenue.
func (r *Repository) TopProducts(ctx context.Context, businessID uuid.UUID, tf Timeframe, now time.Time, limit int) ([]TopProduct, error) {
	if limit <= 0 || limit > 50 {
		limit = 5
	}

	w := resolveWindow(tf, now)

	var rows []TopProduct

	err := r.db.WithContext(ctx).Raw(
		`SELECT sl.product_id::text AS product_id,
		        COALESCE(p.name, 'Unknown') AS name,
		        COALESCE(SUM(sl.line_total),0) AS revenue,
		        COALESCE(SUM(sl.quantity),0) AS quantity,
		        COUNT(*) AS count
		 FROM sale_lines sl
		 JOIN sales s ON s.id = sl.sale_id AND s.status <> 'void'
		 LEFT JOIN products p ON p.id = sl.product_id
		 WHERE sl.business_id = ? AND s.sold_at >= ?
		 GROUP BY sl.product_id, p.name
		 ORDER BY revenue DESC
		 LIMIT ?`,
		businessID, w.lower, limit,
	).Scan(&rows).Error

	return rows, err
}

// ExpenseBreakdown aggregates expenses by category.
func (r *Repository) ExpenseBreakdown(ctx context.Context, businessID uuid.UUID, tf Timeframe, now time.Time) ([]ExpenseBreakdownDataPoint, error) {
	w := resolveWindow(tf, now)

	var rows []ExpenseBreakdownDataPoint

	err := r.db.WithContext(ctx).Raw(
		`SELECT category,
		        COALESCE(SUM(amount),0) AS amount,
		        COALESCE(SUM(tax_amount),0) AS tax_amount,
		        COUNT(*) AS count
		 FROM expenses
		 WHERE business_id = ? AND spent_at >= ?
		 GROUP BY category ORDER BY amount DESC`,
		businessID, w.lower,
	).Scan(&rows).Error

	return rows, err
}

// CashFlowSeries computes inflow (sales) vs outflow (expenses) per bucket.
func (r *Repository) CashFlowSeries(ctx context.Context, businessID uuid.UUID, tf Timeframe, now time.Time) ([]CashFlowDataPoint, error) {
	w := resolveWindow(tf, now)
	expenseBucket := replaceSoldAt(w.bucketExpr)

	type cfRow struct {
		Bucket  string `json:"bucket"`
		Inflow  string `json:"inflow"`
		Outflow string `json:"outflow"`
	}

	var rows []cfRow

	err := r.db.WithContext(ctx).Raw(
		`SELECT COALESCE(s.bucket, e.bucket) AS bucket,
		        COALESCE(s.inflow, 0) AS inflow,
		        COALESCE(e.outflow, 0) AS outflow
		 FROM (
		     SELECT `+w.bucketExpr+` AS bucket, SUM(total) AS inflow
		     FROM sales WHERE business_id = ? AND sold_at >= ? AND status <> 'void'
		     GROUP BY bucket
		 ) s
		 FULL OUTER JOIN (
		     SELECT `+expenseBucket+` AS bucket, SUM(amount) AS outflow
		     FROM expenses WHERE business_id = ? AND spent_at >= ?
		     GROUP BY bucket
		 ) e ON s.bucket = e.bucket
		 ORDER BY bucket ASC`,
		businessID, w.lower, businessID, w.lower,
	).Scan(&rows).Error

	if err != nil {
		return nil, err
	}

	out := make([]CashFlowDataPoint, 0, len(rows))

	for _, row := range rows {
		inflow := decFromString(row.Inflow)
		outflow := decFromString(row.Outflow)
		out = append(out, CashFlowDataPoint{
			Date:    row.Bucket,
			Inflow:  inflow,
			Outflow: outflow,
			NetFlow: inflow.Sub(outflow),
		})
	}

	return out, nil
}

// CustomerSegments groups customers into spend cohorts.
func (r *Repository) CustomerSegments(ctx context.Context, businessID uuid.UUID) ([]CustomerSegmentDataPoint, error) {
	type segRow struct {
		Segment    string `json:"segment"`
		Count      int    `json:"count"`
		TotalSpend string `json:"totalSpend"`
	}

	var rows []segRow

	err := r.db.WithContext(ctx).Raw(
		`SELECT
		     CASE
		       WHEN total_spend >= 100000 THEN 'large-scale'
		       WHEN total_spend >= 10000 THEN 'regular'
		       ELSE 'new'
		     END AS segment,
		     COUNT(*) AS count,
		     COALESCE(SUM(total_spend),0)::text AS total_spend
		 FROM customers
		 WHERE business_id = ?
		 GROUP BY segment`,
		businessID,
	).Scan(&rows).Error

	if err != nil {
		return nil, err
	}

	labelFor := func(seg string) string {
		switch seg {
		case "large-scale":
			return "Large-Scale Farmers"
		case "regular":
			return "Regular Farmers"
		default:
			return "New Farmers"
		}
	}
	out := make([]CustomerSegmentDataPoint, 0, len(rows))

	for _, row := range rows {
		total := decFromString(row.TotalSpend)
		avg := 0.0

		if row.Count > 0 {
			f, _ := total.Float64()
			avg = f / float64(row.Count)
		}

		out = append(out, CustomerSegmentDataPoint{
			Segment:       labelFor(row.Segment),
			Count:         row.Count,
			Growth:        0,
			AvgOrderValue: decFromFloat(avg),
			TotalSpend:    total,
		})
	}

	return out, nil
}

// CustomerLTV returns average total spend across all customers.
func (r *Repository) CustomerLTV(ctx context.Context, businessID uuid.UUID) (decimal.Decimal, error) {
	type ltvRow struct {
		Avg string `json:"avg"`
	}

	var rr ltvRow

	err := r.db.WithContext(ctx).Raw(
		`SELECT COALESCE(AVG(total_spend),0)::text AS avg FROM customers WHERE business_id = ?`,
		businessID,
	).Scan(&rr).Error

	if err != nil {
		return decimal.Zero, err
	}

	return decFromString(rr.Avg), nil
}

// SalesVelocity computes sales count, AOV, and average days-to-close within
// the window (a coarse sales-cycle proxy).
func (r *Repository) SalesVelocity(ctx context.Context, businessID uuid.UUID, tf Timeframe, now time.Time) (*SalesVelocityDataPoint, error) {
	w := resolveWindow(tf, now)

	type vRow struct {
		Count int    `json:"count"`
		Avg   string `json:"avg"`
		Min   string `json:"min"`
		Max   string `json:"max"`
	}

	var rr vRow

	err := r.db.WithContext(ctx).Raw(
		`SELECT COUNT(*) AS count,
		        COALESCE(AVG(total),0)::text AS avg,
		        COALESCE(MIN(sold_at), NOW())::text AS min,
		        COALESCE(MAX(sold_at), NOW())::text AS max
		 FROM sales
		 WHERE business_id = ? AND sold_at >= ? AND status <> 'void'`,
		businessID, w.lower,
	).Scan(&rr).Error

	if err != nil {
		return nil, err
	}

	avgDays := 0.0

	if rr.Count > 0 {
		minT, err1 := time.Parse(time.RFC3339, rr.Min)
		maxT, err2 := time.Parse(time.RFC3339, rr.Max)

		if err1 == nil && err2 == nil && maxT.After(minT) {
			avgDays = maxT.Sub(minT).Hours() / 24
		}
	}

	return &SalesVelocityDataPoint{
		SalesCount:     rr.Count,
		AvgOrderValue:  decFromString(rr.Avg),
		AvgDaysToClose: avgDays,
	}, nil
}

// TaxSummary aggregates VAT (16%) for KRA filing.
func (r *Repository) TaxSummary(ctx context.Context, businessID uuid.UUID, tf Timeframe, now time.Time) (*TaxSummary, error) {
	w := resolveWindow(tf, now)

	type totRow struct {
		TotalTax     string `json:"totalTax"`
		TaxableSales string `json:"taxableSales"`
		TotalSales   string `json:"totalSales"`
		Count        int    `json:"count"`
	}

	var tot totRow

	err := r.db.WithContext(ctx).Raw(
		`SELECT COALESCE(SUM(tax_amount),0)::text AS total_tax,
		        COALESCE(SUM(subtotal),0)::text AS taxable_sales,
		        COALESCE(SUM(total),0)::text AS total_sales,
		        COUNT(*) AS count
		 FROM sales WHERE business_id = ? AND sold_at >= ? AND status <> 'void'`,
		businessID, w.lower,
	).Scan(&tot).Error

	if err != nil {
		return nil, err
	}
	// By product: allocate tax proportionally as line_total*0.16 (line_total is pre-tax subtotal)
	type prodRow struct {
		ProductID string `json:"productId"`
		Name      string `json:"name"`
		Category  string `json:"category"`
		Revenue   string `json:"revenue"`
		Quantity  string `json:"quantity"`
	}

	var prodRows []prodRow

	_ = r.db.WithContext(ctx).Raw(
		`SELECT sl.product_id::text AS product_id,
		        COALESCE(p.name,'Unknown') AS name,
		        COALESCE(p.category,'Uncategorized') AS category,
		        COALESCE(SUM(sl.line_total),0)::text AS revenue,
		        COALESCE(SUM(sl.quantity),0)::text AS quantity
		 FROM sale_lines sl
		 JOIN sales s ON s.id = sl.sale_id AND s.status <> 'void'
		 LEFT JOIN products p ON p.id = sl.product_id
		 WHERE sl.business_id = ? AND s.sold_at >= ?
		 GROUP BY sl.product_id, p.name, p.category
		 ORDER BY revenue DESC`,
		businessID, w.lower,
	).Scan(&prodRows).Error

	byProd := make([]TaxByProduct, 0, len(prodRows))

	for _, pr := range prodRows {
		rev := decFromString(pr.Revenue)
		tax := rev.Mul(decimal.NewFromFloat(0.16)).Round(2)
		byProd = append(byProd, TaxByProduct{
			ProductID: pr.ProductID,
			Name:      pr.Name,
			Category:  pr.Category,
			Revenue:   rev,
			TaxAmount: tax,
			Quantity:  decFromString(pr.Quantity),
		})
	}
	// By category
	type catRow struct {
		Category string `json:"category"`
		Revenue  string `json:"revenue"`
		Count    int    `json:"count"`
	}

	var catRows []catRow

	_ = r.db.WithContext(ctx).Raw(
		`SELECT COALESCE(p.category,'Uncategorized') AS category,
		        COALESCE(SUM(sl.line_total),0)::text AS revenue,
		        COUNT(*) AS count
		 FROM sale_lines sl
		 JOIN sales s ON s.id = sl.sale_id AND s.status <> 'void'
		 LEFT JOIN products p ON p.id = sl.product_id
		 WHERE sl.business_id = ? AND s.sold_at >= ?
		 GROUP BY category ORDER BY revenue DESC`,
		businessID, w.lower,
	).Scan(&catRows).Error

	byCat := make([]TaxByCategory, 0, len(catRows))

	for _, cr := range catRows {
		rev := decFromString(cr.Revenue)
		tax := rev.Mul(decimal.NewFromFloat(0.16)).Round(2)
		byCat = append(byCat, TaxByCategory{
			Category:  cr.Category,
			Revenue:   rev,
			TaxAmount: tax,
			Count:     cr.Count,
		})
	}

	totalTax := decFromString(tot.TotalTax)
	// KRA payable = total VAT collected (output VAT). If business has input VAT from expenses, could subtract, but v1 = output only.
	return &TaxSummary{
		Timeframe:        tf,
		TotalTax:         totalTax,
		TaxableSales:     decFromString(tot.TaxableSales),
		TotalSales:       decFromString(tot.TotalSales),
		TransactionCount: tot.Count,
		ByProduct:        byProd,
		ByCategory:       byCat,
		KRAPayable:       totalTax,
		VATRate:          0.16,
		GeneratedAt:      now,
	}, nil
}

// UpsertSnapshot atomically replaces the stored snapshot for
// (business, timeframe), enforcing a single materialized row.
// Uses INSERT ... ON CONFLICT to remain idempotent under concurrent Compute() calls.
func (r *Repository) UpsertSnapshot(ctx context.Context, s *Snapshot) error {
	raw, err := json.Marshal(s)
	if err != nil {
		return err
	}

	stored := StoredSnapshot{
		ID:          uuid.New(),
		TenantID:    s.BusinessID,
		BusinessID:  s.BusinessID,
		Timeframe:   string(s.Timeframe),
		Payload:     raw,
		GeneratedAt: s.GeneratedAt,
	}

	// Prefer native UPSERT to avoid race between concurrent DELETE+CREATE transactions
	// that hit idx_analytics_snapshots_business_timeframe (partial unique index).
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Attempt UPSERT first (handles concurrent callers)
		err := tx.Exec(`
			INSERT INTO analytics_snapshots (id, tenant_id, business_id, timeframe, payload, generated_at, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
			ON CONFLICT (business_id, timeframe) WHERE timeframe IN ('day','week','month','year')
			DO UPDATE SET payload = EXCLUDED.payload, generated_at = EXCLUDED.generated_at, updated_at = NOW()
		`, stored.ID, stored.TenantID, stored.BusinessID, stored.Timeframe, stored.Payload, stored.GeneratedAt).Error

		if err == nil {
			return nil
		}
		// Fallback for older schema or unexpected conflict: delete+create
		if err := tx.Where("business_id = ? AND timeframe = ?", s.BusinessID, string(s.Timeframe)).
			Delete(&StoredSnapshot{}).Error; err != nil {
			return err
		}

		return tx.Create(&stored).Error
	})
}

// FindSnapshot loads the latest stored snapshot for a business/timeframe.
func (r *Repository) FindSnapshot(ctx context.Context, businessID uuid.UUID, tf Timeframe) (*Snapshot, error) {
	var stored StoredSnapshot

	err := r.db.WithContext(ctx).
		Scopes(shareddb.BusinessScope(businessID)).
		Where("timeframe = ?", string(tf)).
		Order("generated_at DESC").
		First(&stored).Error

	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.ErrNotFound.WithMessage("analytics not yet generated for this timeframe")
		}

		return nil, err
	}

	var s Snapshot
	if err := json.Unmarshal(stored.Payload, &s); err != nil {
		return nil, err
	}

	return &s, nil
}
