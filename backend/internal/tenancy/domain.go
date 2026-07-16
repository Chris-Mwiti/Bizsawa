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
