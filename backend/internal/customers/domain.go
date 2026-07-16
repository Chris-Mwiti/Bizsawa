package customers

import (
	"time"

	"github.com/Codecx-Org/FinAI/backend/internal/shared/db"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

type Customer struct {
	db.BaseModel
	BusinessID     uuid.UUID       `gorm:"type:uuid;not null;index" json:"businessId"`
	Name           string          `gorm:"not null" json:"name"`
	Phone          string          `gorm:"type:text;index" json:"phone"`
	Email          string          `gorm:"type:text;index" json:"email"`
	Address        string          `json:"address"`
	Tags           []string        `gorm:"serializer:json;type:jsonb" json:"tags"`
	Notes          string          `json:"notes"`
	LoyaltyPoints  int             `gorm:"not null;default:0" json:"loyaltyPoints"`
	TotalSpend     decimal.Decimal `gorm:"type:numeric(18,2);not null;default:0" json:"totalSpend"`
	LastPurchaseAt *time.Time      `json:"lastPurchaseAt"`
}

func (Customer) TableName() string { return "customers" }

type PurchaseHistoryEntry struct {
	SaleID        uuid.UUID       `json:"saleId"`
	ReceiptNumber string          `json:"receiptNumber"`
	PurchasedAt   time.Time       `json:"purchasedAt"`
	Total         decimal.Decimal `json:"total"`
}
