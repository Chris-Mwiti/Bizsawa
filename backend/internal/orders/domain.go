package orders

import (
	"github.com/Codecx-Org/FinAI/backend/internal/shared/db"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"time"
)

type Status string

const (
	StatusDraft     Status = "draft"
	StatusConfirmed Status = "confirmed"
	StatusFulfilled Status = "fulfilled"
	StatusCancelled Status = "cancelled"
	StatusRefunded  Status = "refunded"
)

type Order struct {
	db.BaseModel
	BusinessID     uuid.UUID       `gorm:"type:uuid;not null;index" json:"businessId"`
	CustomerID     *uuid.UUID      `gorm:"type:uuid;index" json:"customerId"`
	Status         Status          `gorm:"type:text;not null;default:'draft';index" json:"status"`
	Subtotal       decimal.Decimal `gorm:"type:numeric(18,2);not null" json:"subtotal"`
	TaxAmount      decimal.Decimal `gorm:"type:numeric(18,2);not null" json:"taxAmount"`
	Total          decimal.Decimal `gorm:"type:numeric(18,2);not null" json:"total"`
	PaymentMethod  string          `gorm:"type:text;not null;default:'cash'" json:"paymentMethod"`
	IdempotencyKey string          `gorm:"type:text;uniqueIndex:idx_orders_business_idem" json:"-"`
	ConfirmedAt    *time.Time      `json:"confirmedAt"`
	FulfilledAt    *time.Time      `json:"fulfilledAt"`
	Lines          []OrderLine     `gorm:"foreignKey:OrderID" json:"lines,omitempty"`
}

func (Order) TableName() string { return "orders" }

type OrderLine struct {
	db.BaseModel
	BusinessID uuid.UUID       `gorm:"type:uuid;not null;index" json:"businessId"`
	OrderID    uuid.UUID       `gorm:"type:uuid;not null;index" json:"orderId"`
	ProductID  uuid.UUID       `gorm:"type:uuid;not null;index" json:"productId"`
	Quantity   decimal.Decimal `gorm:"type:numeric(18,3);not null" json:"quantity"`
	UnitPrice  decimal.Decimal `gorm:"type:numeric(18,2);not null" json:"unitPrice"`
	LineTotal  decimal.Decimal `gorm:"type:numeric(18,2);not null" json:"lineTotal"`
}

func (OrderLine) TableName() string { return "order_lines" }
