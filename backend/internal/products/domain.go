package products

import (
	"github.com/Codecx-Org/FinAI/backend/internal/shared/db"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

type Product struct {
	db.BaseModel
	BusinessID  uuid.UUID        `gorm:"type:uuid;not null;index;uniqueIndex:idx_products_business_sku" json:"businessId"`
	Name        string           `gorm:"not null" json:"name"`
	Description string           `json:"description"`
	SKU         string           `gorm:"column:sku;type:text;uniqueIndex:idx_products_business_sku" json:"sku"`
	Category    string           `gorm:"type:text;index" json:"category"`
	Barcode     string           `gorm:"type:text;index" json:"barcode"`
	ImageURL    string           `json:"imageUrl"`
	TaxRuleID   *uuid.UUID       `gorm:"type:uuid" json:"taxRuleId"`
	Price       decimal.Decimal  `gorm:"type:numeric(18,2);not null" json:"price"`
	Cost        decimal.Decimal  `gorm:"type:numeric(18,2);not null" json:"cost"`
	IsActive    bool             `gorm:"not null;default:true" json:"isActive"`
	Variants    []ProductVariant `gorm:"foreignKey:ProductID" json:"variants,omitempty"`
}

func (Product) TableName() string { return "products" }

type ProductVariant struct {
	db.BaseModel
	BusinessID uuid.UUID       `gorm:"type:uuid;not null;index;uniqueIndex:idx_product_variants_business_sku" json:"businessId"`
	ProductID  uuid.UUID       `gorm:"type:uuid;not null;index" json:"productId"`
	Name       string          `gorm:"not null" json:"name"`
	SKU        string          `gorm:"column:sku;type:text;uniqueIndex:idx_product_variants_business_sku" json:"sku"`
	Barcode    string          `gorm:"type:text;index" json:"barcode"`
	Price      decimal.Decimal `gorm:"type:numeric(18,2);not null" json:"price"`
	Cost       decimal.Decimal `gorm:"type:numeric(18,2);not null" json:"cost"`
	IsActive   bool            `gorm:"not null;default:true" json:"isActive"`
}

func (ProductVariant) TableName() string { return "product_variants" }
