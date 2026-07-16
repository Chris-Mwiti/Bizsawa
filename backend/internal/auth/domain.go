package auth

import (
	"time"

	"github.com/google/uuid"
)

type User struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Email        string    `gorm:"not null;uniqueIndex" json:"email"`
	PasswordHash string    `gorm:"not null" json:"-"`
	IsActive     bool      `gorm:"not null;default:true" json:"isActive"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

func (User) TableName() string { return "auth_users" }

type RefreshToken struct {
	ID         uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	UserID     uuid.UUID  `gorm:"type:uuid;not null;index"`
	TenantID   uuid.UUID  `gorm:"type:uuid;index"`
	BusinessID uuid.UUID  `gorm:"type:uuid;index"`
	Roles      []string   `gorm:"serializer:json"`
	TokenHash  string     `gorm:"not null;uniqueIndex"`
	ExpiresAt  time.Time  `gorm:"not null;index"`
	RevokedAt  *time.Time `gorm:"index"`
	CreatedAt  time.Time  `gorm:"not null;default:now()"`
}

func (RefreshToken) TableName() string { return "auth_refresh_tokens" }
