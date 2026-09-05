package analytics

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// Timeframe represents the aggregation window for pre-computed analytics.
type Timeframe string

const (
	TimeframeDay   Timeframe = "day"
	TimeframeWeek  Timeframe = "week"
	TimeframeMonth Timeframe = "month"
	TimeframeYear  Timeframe = "year"
)

// ValidTimeframe reports whether t is a supported aggregation window.
func (t Timeframe) Valid() bool {
	switch t {
	case TimeframeDay, TimeframeWeek, TimeframeMonth, TimeframeYear:
		return true
	default:
		return false
	}
}

// RevenueDataPoint is a single date bucket of revenue within a timeframe.
type RevenueDataPoint struct {
	Date         string          `json:"date"`
	Revenue      decimal.Decimal `json:"revenue"`
	Transactions int             `json:"transactions"`
}

// ProfitDataPoint is a single date bucket of revenue/expenses/profit.
type ProfitDataPoint struct {
	Date    string          `json:"date"`
	Revenue decimal.Decimal `json:"revenue"`
	Expense decimal.Decimal `json:"expense"`
	Profit  decimal.Decimal `json:"profit"`
	Margin  float64         `json:"margin"`
}

// CategoryDataPoint is a product category performance bucket.
type CategoryDataPoint struct {
	Name       string          `json:"name"`
	Revenue    decimal.Decimal `json:"revenue"`
	Percentage float64         `json:"percentage"`
	Trend      string          `json:"trend"` // up, down, stable
}

// TopProduct is a best-selling product aggregate.
type TopProduct struct {
	ProductID string          `json:"productId"`
	Name      string          `json:"name"`
	Revenue   decimal.Decimal `json:"revenue"`
	Quantity  decimal.Decimal `json:"quantity"`
	Count     int             `json:"count"`
}

// CustomerSegmentDataPoint is a customer cohort aggregate.
type CustomerSegmentDataPoint struct {
	Segment       string          `json:"segment"`
	Count         int             `json:"count"`
	Growth        float64         `json:"growth"`
	AvgOrderValue decimal.Decimal `json:"avgOrderValue"`
	TotalSpend    decimal.Decimal `json:"totalSpend"`
}

// ExpenseBreakdownDataPoint is an expense category aggregate.
type ExpenseBreakdownDataPoint struct {
	Category  string          `json:"category"`
	Amount    decimal.Decimal `json:"amount"`
	TaxAmount decimal.Decimal `json:"taxAmount"`
	Count     int             `json:"count"`
}

// CashFlowDataPoint is a single date bucket of net cash flow.
type CashFlowDataPoint struct {
	Date    string          `json:"date"`
	Inflow  decimal.Decimal `json:"inflow"`
	Outflow decimal.Decimal `json:"outflow"`
	NetFlow decimal.Decimal `json:"netFlow"`
}

// SalesVelocityDataPoint captures how quickly sales convert.
type SalesVelocityDataPoint struct {
	SalesCount     int             `json:"salesCount"`
	AvgOrderValue  decimal.Decimal `json:"avgOrderValue"`
	AvgDaysToClose float64         `json:"avgDaysToClose"`
}

// Snapshot is the materialized, ready-to-serve analytics payload for a
// business and timeframe. It is pre-computed by River background jobs so
// reads never compute on the request path.
type Snapshot struct {
	BusinessID    uuid.UUID                   `json:"businessId"`
	Timeframe     Timeframe                   `json:"timeframe"`
	Revenue       *RevenueSummary             `json:"revenue"`
	Profit        *ProfitSummary              `json:"profit"`
	Categories    []CategoryDataPoint         `json:"categories"`
	TopProducts   []TopProduct                `json:"topProducts"`
	Customers     *CustomerSummary            `json:"customers"`
	Expenses      []ExpenseBreakdownDataPoint `json:"expenses"`
	CashFlow      []CashFlowDataPoint         `json:"cashFlow"`
	SalesVelocity *SalesVelocityDataPoint     `json:"salesVelocity"`
	GeneratedAt   time.Time                   `json:"generatedAt"`
}

type RevenueSummary struct {
	Data         []RevenueDataPoint `json:"data"`
	TotalRevenue decimal.Decimal    `json:"totalRevenue"`
	Transactions int                `json:"transactions"`
	GrowthRate   float64            `json:"growthRate"`
}

type ProfitSummary struct {
	Data        []ProfitDataPoint `json:"data"`
	TotalProfit decimal.Decimal   `json:"totalProfit"`
	AvgMargin   float64           `json:"avgMargin"`
}

type CustomerSummary struct {
	Segments []CustomerSegmentDataPoint `json:"segments"`
	LTV      decimal.Decimal            `json:"ltv"`
}

// StoredSnapshot is the GORM persistence model for analytics_snapshots.
type StoredSnapshot struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID    uuid.UUID `gorm:"type:uuid;not null;index" json:"tenantId"`
	BusinessID  uuid.UUID `gorm:"type:uuid;not null;index" json:"businessId"`
	Timeframe   string    `gorm:"type:text;not null" json:"timeframe"`
	Payload     []byte    `gorm:"type:jsonb;not null" json:"payload"`
	GeneratedAt time.Time `gorm:"not null" json:"generatedAt"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

func (StoredSnapshot) TableName() string { return "analytics_snapshots" }
