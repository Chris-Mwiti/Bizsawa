package inventory

import (
	"github.com/Codecx-Org/FinAI/backend/internal/shared/db"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"time"
)

type InventoryItem struct {
	db.BaseModel
	BusinessID        uuid.UUID       `gorm:"type:uuid;not null;index;uniqueIndex:idx_inventory_business_product" json:"businessId"`
	ProductID         uuid.UUID       `gorm:"type:uuid;not null;index;uniqueIndex:idx_inventory_business_product" json:"productId"`
	Quantity          decimal.Decimal `gorm:"type:numeric(18,3);not null;default:0" json:"quantity"`
	LowStockThreshold decimal.Decimal `gorm:"type:numeric(18,3);not null;default:0" json:"lowStockThreshold"`
}

func (InventoryItem) TableName() string { return "inventory_items" }

type StockMovement struct {
	db.BaseModel
	BusinessID    uuid.UUID       `gorm:"type:uuid;not null;index" json:"businessId"`
	ProductID     uuid.UUID       `gorm:"type:uuid;not null;index" json:"productId"`
	QuantityDelta decimal.Decimal `gorm:"type:numeric(18,3);not null" json:"quantityDelta"`
	MovementType  string          `gorm:"type:text;not null;index" json:"movementType"`
	ReferenceType string          `gorm:"type:text;index" json:"referenceType"`
	ReferenceID   *uuid.UUID      `gorm:"type:uuid;index" json:"referenceId"`
	Notes         string          `json:"notes"`
	OccurredAt    time.Time       `gorm:"not null;index" json:"occurredAt"`
}

func (StockMovement) TableName() string { return "stock_movements" }

type Valuation struct {
	ProductID uuid.UUID       `json:"productId"`
	Quantity  decimal.Decimal `json:"quantity"`
}
