package invoices

import (
	"time"

	"github.com/Codecx-Org/FinAI/backend/internal/shared/db"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

type Status string

const (
	StatusDraft     Status = "draft"
	StatusSent      Status = "sent"
	StatusViewed    Status = "viewed"
	StatusPartial   Status = "partial"
	StatusPaid      Status = "paid"
	StatusOverdue   Status = "overdue"
	StatusCancelled Status = "cancelled"
)

type Invoice struct {
	db.BaseModel
	BusinessID    uuid.UUID       `gorm:"type:uuid;not null;index" json:"businessId"`
	CustomerID    *uuid.UUID      `gorm:"type:uuid;index" json:"customerId"`
	InvoiceNumber string          `gorm:"type:text;not null;uniqueIndex:idx_invoices_business_number" json:"invoiceNumber"`
	Status        Status          `gorm:"type:text;not null;default:'draft';index" json:"status"`
	Subtotal      decimal.Decimal `gorm:"type:numeric(18,2);not null" json:"subtotal"`
	TaxAmount     decimal.Decimal `gorm:"type:numeric(18,2);not null" json:"taxAmount"`
	Total         decimal.Decimal `gorm:"type:numeric(18,2);not null" json:"total"`
	AmountPaid    decimal.Decimal `gorm:"type:numeric(18,2);not null;default:0" json:"amountPaid"`
	AmountDue     decimal.Decimal `gorm:"type:numeric(18,2);not null" json:"amountDue"`
	Currency      string          `gorm:"type:text;not null;default:'KES'" json:"currency"`
	Notes         string          `json:"notes"`
	DueAt         *time.Time      `json:"dueAt"`
	SentAt        *time.Time      `json:"sentAt"`
	ViewedAt      *time.Time      `json:"viewedAt"`
	PaidAt        *time.Time      `json:"paidAt"`
	Lines         []InvoiceLine   `gorm:"foreignKey:InvoiceID" json:"lines,omitempty"`
}

func (Invoice) TableName() string { return "invoices" }

type InvoiceLine struct {
	db.BaseModel
	BusinessID  uuid.UUID       `gorm:"type:uuid;not null;index" json:"businessId"`
	InvoiceID   uuid.UUID       `gorm:"type:uuid;not null;index" json:"invoiceId"`
	ProductID   *uuid.UUID      `gorm:"type:uuid;index" json:"productId"`
	Description string          `gorm:"type:text;not null" json:"description"`
	Quantity    decimal.Decimal `gorm:"type:numeric(18,3);not null" json:"quantity"`
	UnitPrice   decimal.Decimal `gorm:"type:numeric(18,2);not null" json:"unitPrice"`
	LineTotal   decimal.Decimal `gorm:"type:numeric(18,2);not null" json:"lineTotal"`
}

func (InvoiceLine) TableName() string { return "invoice_lines" }
