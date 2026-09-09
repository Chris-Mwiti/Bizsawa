package users

import (
	"time"

	"github.com/google/uuid"

	shareddb "github.com/Codecx-Org/FinAI/backend/internal/shared/db"
)

// BusinessMember is a tenancy table — NOT syncable — so it must NOT include sync_version.
// Using TenantModel (without SyncVersion) prevents "column sync_version does not exist" on INSERT.
type BusinessMember struct {
	shareddb.TenantModel
	BusinessID uuid.UUID  `gorm:"type:uuid;not null;uniqueIndex:idx_business_user" json:"businessId"`
	UserID     uuid.UUID  `gorm:"type:uuid;not null;uniqueIndex:idx_business_user" json:"userId"`
	Role       string     `gorm:"type:text;not null" json:"role"`
	IsActive   bool       `gorm:"not null;default:true" json:"isActive"`
	InvitedBy  uuid.UUID  `gorm:"type:uuid" json:"invitedBy"`
	InvitedAt  time.Time  `gorm:"not null;default:now()" json:"invitedAt"`
	JoinedAt   *time.Time `json:"joinedAt"`
}

func (BusinessMember) TableName() string { return "business_members" }

type UserProfile struct {
	shareddb.TenantModel
	UserID    uuid.UUID `gorm:"type:uuid;not null;uniqueIndex" json:"userId"`
	FirstName string    `json:"firstName"`
	LastName  string    `json:"lastName"`
	Phone     string    `json:"phone"`
	AvatarURL string    `json:"avatarUrl"`
	Timezone  string    `gorm:"not null;default:'Africa/Nairobi'" json:"timezone"`
	Language  string    `gorm:"not null;default:'en'" json:"language"`
}

func (UserProfile) TableName() string { return "user_profiles" }
