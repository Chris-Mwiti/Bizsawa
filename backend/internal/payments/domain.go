package payments

import (
	"encoding/json"
	"time"

	"github.com/Codecx-Org/FinAI/backend/internal/shared/db"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

type CommandType string
type Status string

const (
	CommandSTKPush CommandType = "stk_push"
	CommandB2C     CommandType = "b2c"
	CommandC2B     CommandType = "c2b"

	StatusPending    Status = "pending"
	StatusProcessing Status = "processing"
	StatusSucceeded  Status = "succeeded"
	StatusFailed     Status = "failed"
)

type PaymentCommand struct {
	db.BaseModel
	BusinessID        uuid.UUID       `gorm:"type:uuid;not null;index;uniqueIndex:idx_payment_business_idem" json:"businessId"`
	InvoiceID         *uuid.UUID      `gorm:"type:uuid;index" json:"invoiceId"`
	Type              CommandType     `gorm:"type:text;not null;index" json:"type"`
	Status            Status          `gorm:"type:text;not null;default:'pending';index" json:"status"`
	IdempotencyKey    string          `gorm:"type:text;not null;uniqueIndex:idx_payment_business_idem" json:"-"`
	Amount            decimal.Decimal `gorm:"type:numeric(18,2);not null" json:"amount"`
	Currency          string          `gorm:"type:text;not null;default:'KES'" json:"currency"`
	Phone             string          `gorm:"type:text" json:"phone"`
	AccountReference  string          `gorm:"type:text" json:"accountReference"`
	Provider          string          `gorm:"type:text;not null;default:'mpesa'" json:"provider"`
	ProviderRequestID string          `gorm:"type:text;index" json:"providerRequestId"`
	ProviderReceipt   string          `gorm:"type:text;index" json:"providerReceipt"`
	FailureCode       string          `gorm:"type:text" json:"failureCode"`
	FailureMessage    string          `gorm:"type:text" json:"failureMessage"`
	Payload           json.RawMessage `gorm:"type:jsonb;not null;default:'{}'::jsonb" json:"payload,omitempty"`
	ResultPayload     json.RawMessage `gorm:"type:jsonb" json:"resultPayload,omitempty"`
	ProcessedAt       *time.Time      `json:"processedAt"`
}

func (PaymentCommand) TableName() string { return "payment_commands" }

type ResultEvent struct {
	PaymentID         uuid.UUID       `json:"paymentId"`
	BusinessID        uuid.UUID       `json:"businessId"`
	Status            Status          `json:"status"`
	Provider          string          `json:"provider"`
	ProviderRequestID string          `json:"providerRequestId"`
	ProviderReceipt   string          `json:"providerReceipt"`
	Amount            decimal.Decimal `json:"amount"`
	FailureCode       string          `json:"failureCode,omitempty"`
	FailureMessage    string          `json:"failureMessage,omitempty"`
}
