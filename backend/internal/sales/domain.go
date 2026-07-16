package sales

import (
	"github.com/Codecx-Org/FinAI/backend/internal/shared/db"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"time"
)

type Sale struct {
	db.BaseModel
	BusinessID     uuid.UUID       `gorm:"type:uuid;not null;index" json:"businessId"`
	OrderID        *uuid.UUID      `gorm:"type:uuid;uniqueIndex" json:"orderId"`
	CustomerID     *uuid.UUID      `gorm:"type:uuid;index" json:"customerId"`
	ReceiptNumber  string          `gorm:"type:text;not null;uniqueIndex:idx_sales_business_receipt" json:"receiptNumber"`
	StaffID        uuid.UUID       `gorm:"type:uuid;index" json:"staffId"`
	PaymentMethod  string          `gorm:"type:text;not null" json:"paymentMethod"`
	Subtotal       decimal.Decimal `gorm:"type:numeric(18,2);not null" json:"subtotal"`
	TaxAmount      decimal.Decimal `gorm:"type:numeric(18,2);not null" json:"taxAmount"`
	Total          decimal.Decimal `gorm:"type:numeric(18,2);not null" json:"total"`
	Status         string          `gorm:"type:text;not null;default:'completed'" json:"status"`
	IdempotencyKey string          `gorm:"type:text;uniqueIndex:idx_sales_business_idem" json:"-"`
	SoldAt         time.Time       `gorm:"not null;index" json:"soldAt"`
	Lines          []SaleLine      `gorm:"foreignKey:SaleID" json:"lines,omitempty"`
}

func (Sale) TableName() string { return "sales" }

type SaleLine struct {
	db.BaseModel
	BusinessID uuid.UUID       `gorm:"type:uuid;not null;index" json:"businessId"`
	SaleID     uuid.UUID       `gorm:"type:uuid;not null;index" json:"saleId"`
	ProductID  uuid.UUID       `gorm:"type:uuid;not null;index" json:"productId"`
	Quantity   decimal.Decimal `gorm:"type:numeric(18,3);not null" json:"quantity"`
	UnitPrice  decimal.Decimal `gorm:"type:numeric(18,2);not null" json:"unitPrice"`
	LineTotal  decimal.Decimal `gorm:"type:numeric(18,2);not null" json:"lineTotal"`
}

func (SaleLine) TableName() string { return "sale_lines" }

type Summary struct {
	Count     int64           `json:"count"`
	Subtotal  decimal.Decimal `json:"subtotal"`
	TaxAmount decimal.Decimal `json:"taxAmount"`
	Total     decimal.Decimal `json:"total"`
}
type Breakdown struct {
	Key   string          `json:"key"`
	Total decimal.Decimal `json:"total"`
	Count int64           `json:"count"`
}
