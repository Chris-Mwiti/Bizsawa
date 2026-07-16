package expenses

import (
	"github.com/Codecx-Org/FinAI/backend/internal/shared/db"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"time"
)

type Expense struct {
	db.BaseModel
	BusinessID        uuid.UUID       `gorm:"type:uuid;not null;index" json:"businessId"`
	Category          string          `gorm:"type:text;not null;index" json:"category"`
	Description       string          `json:"description"`
	Vendor            string          `json:"vendor"`
	Amount            decimal.Decimal `gorm:"type:numeric(18,2);not null" json:"amount"`
	TaxAmount         decimal.Decimal `gorm:"type:numeric(18,2);not null;default:0" json:"taxAmount"`
	IsRecurring       bool            `gorm:"not null;default:false" json:"isRecurring"`
	RecurringInterval string          `gorm:"type:text" json:"recurringInterval"`
	SpentAt           time.Time       `gorm:"not null;index" json:"spentAt"`
	CreatedBy         uuid.UUID       `gorm:"type:uuid;index" json:"createdBy"`
}

func (Expense) TableName() string { return "expenses" }

type CategorySummary struct {
	Category  string          `json:"category"`
	Amount    decimal.Decimal `json:"amount"`
	TaxAmount decimal.Decimal `json:"taxAmount"`
	Count     int64           `json:"count"`
}
