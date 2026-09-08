package tenancy

import (
	"time"

	"github.com/google/uuid"
)

type PlanCode string

const (
	PlanFree       PlanCode = "free"
	PlanPremium    PlanCode = "premium"
	PlanEnterprise PlanCode = "enterprise"
)

type Plan struct {
	Code          PlanCode `json:"code"`
	Name          string   `json:"name"`
	MaxBusinesses int      `json:"maxBusinesses"`
	AIAccess      bool     `json:"aiAccess"`
	Reports       string   `json:"reports"`
	APIAccess     bool     `json:"apiAccess"`
}

type Subscription struct {
	ID        uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID    uuid.UUID  `gorm:"type:uuid;not null;index" json:"userId"`
	PlanCode  PlanCode   `gorm:"type:text;not null" json:"planCode"`
	Status    string     `gorm:"type:text;not null;default:'ACTIVE'" json:"status"`
	StartedAt time.Time  `gorm:"not null;default:now()" json:"startedAt"`
	EndsAt    *time.Time `json:"endsAt"`
	CreatedAt time.Time  `json:"createdAt"`
	UpdatedAt time.Time  `json:"updatedAt"`
}

func (Subscription) TableName() string { return "tenancy_subscriptions" }

func Plans() []Plan {
	return []Plan{{Code: PlanFree, Name: "Free", MaxBusinesses: 1, AIAccess: false, Reports: "basic", APIAccess: false}, {Code: PlanPremium, Name: "Premium", MaxBusinesses: 5, AIAccess: true, Reports: "full", APIAccess: true}, {Code: PlanEnterprise, Name: "Enterprise", MaxBusinesses: 0, AIAccess: true, Reports: "custom", APIAccess: true}}
}

func PlanByCode(code PlanCode) Plan {
	for _, plan := range Plans() {
		if plan.Code == code {
			return plan
		}
	}

	return Plans()[0]
}

// SubscriptionPayment is isolated from business payment_commands — subscriptions are per-user, not per-business.
type SubscriptionPayment struct {
	ID                 uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID             uuid.UUID `gorm:"type:uuid;not null;index" json:"userId"`
	PlanCode           PlanCode  `gorm:"type:text;not null" json:"planCode"`
	Amount             string    `gorm:"type:numeric(18,2);not null" json:"amount"`
	Currency           string    `gorm:"type:text;not null;default:'KES'" json:"currency"`
	Phone              string    `gorm:"type:text;not null" json:"phone"`
	CheckoutRequestID  string    `gorm:"type:text;index" json:"checkoutRequestId"`
	ProviderReceipt    string    `gorm:"type:text;index" json:"providerReceipt"`
	Status             string    `gorm:"type:text;not null;default:'pending'" json:"status"`
	FailureCode        string    `gorm:"type:text" json:"failureCode"`
	FailureMessage     string    `gorm:"type:text" json:"failureMessage"`
	AccountReference   string    `gorm:"type:text" json:"accountReference"`
	IdempotencyKey     string    `gorm:"type:text;not null;unique" json:"idempotencyKey"`
	Payload            string    `gorm:"type:jsonb;not null;default:'{}'::jsonb" json:"payload"`
	ResultPayload      string    `gorm:"type:jsonb" json:"resultPayload"`
	CreatedAt          time.Time `json:"createdAt"`
	UpdatedAt          time.Time `json:"updatedAt"`
}

func (SubscriptionPayment) TableName() string { return "subscription_payments" }

// Pricing — single source of truth, KES.
func PriceForPlan(code PlanCode) string {
	switch code {
	case PlanPremium:
		return "399"
	case PlanEnterprise:
		return "999"
	default:
		return "0"
	}
}
