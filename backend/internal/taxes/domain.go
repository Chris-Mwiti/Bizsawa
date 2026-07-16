package taxes

import (
	"time"

	"github.com/Codecx-Org/FinAI/backend/internal/shared/db"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

type TaxRule struct {
	db.BaseModel
	BusinessID uuid.UUID       `gorm:"type:uuid;not null;index" json:"businessId"`
	Name       string          `gorm:"not null" json:"name"`
	Rate       decimal.Decimal `gorm:"type:numeric(8,4);not null" json:"rate"`
	Country    string          `gorm:"type:text;not null;default:'KE'" json:"country"`
	IsDefault  bool            `gorm:"not null;default:false" json:"isDefault"`
	IsActive   bool            `gorm:"not null;default:true" json:"isActive"`
}

func (TaxRule) TableName() string { return "tax_rules" }

type TaxEntry struct {
	db.BaseModel
	BusinessID uuid.UUID       `gorm:"type:uuid;not null;index" json:"businessId"`
	SourceType string          `gorm:"type:text;not null;index" json:"sourceType"`
	SourceID   uuid.UUID       `gorm:"type:uuid;not null;index" json:"sourceId"`
	TaxRuleID  *uuid.UUID      `gorm:"type:uuid" json:"taxRuleId"`
	TaxType    string          `gorm:"type:text;not null" json:"taxType"`
	Taxable    decimal.Decimal `gorm:"type:numeric(18,2);not null" json:"taxable"`
	Amount     decimal.Decimal `gorm:"type:numeric(18,2);not null" json:"amount"`
	OccurredAt time.Time       `gorm:"not null;index" json:"occurredAt"`
}

func (TaxEntry) TableName() string { return "tax_entries" }

type PeriodSummary struct {
	TaxType string          `json:"taxType"`
	Taxable decimal.Decimal `json:"taxable"`
	Amount  decimal.Decimal `json:"amount"`
}
