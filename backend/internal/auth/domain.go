package auth

import (
	"time"

	"github.com/google/uuid"
)

type User struct {
	ID                uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Email             string    `gorm:"not null;uniqueIndex" json:"email"`
	PasswordHash      string    `gorm:"type:text;not null;default:''" json:"-"`
	IsActive          bool      `gorm:"not null;default:true" json:"isActive"`
	Name              string    `gorm:"type:text" json:"name"`
	Image             string    `gorm:"type:text" json:"image"`
	EmailVerified     bool      `gorm:"not null;default:false" json:"emailVerified"`
	Provider          string    `gorm:"type:text;not null;default:'credential'" json:"provider"`
	ProviderAccountID *string   `gorm:"type:text;index" json:"providerAccountId"`
	CreatedAt         time.Time `json:"createdAt"`
	UpdatedAt         time.Time `json:"updatedAt"`
}

// Account mirrors better-auth account table (linked social providers).
type Account struct {
	ID                uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID            uuid.UUID  `gorm:"type:uuid;not null;index" json:"userId"`
	Provider          string     `gorm:"type:text;not null" json:"provider"`
	ProviderAccountID string     `gorm:"type:text;not null;uniqueIndex:idx_provider_account" json:"providerAccountId"`
	AccessToken       string     `gorm:"type:text" json:"accessToken"`
	RefreshToken      string     `gorm:"type:text" json:"refreshToken"`
	IDToken           string     `gorm:"type:text" json:"idToken"`
	ExpiresAt         *time.Time `json:"expiresAt"`
	Scope             string     `gorm:"type:text" json:"scope"`
	CreatedAt         time.Time  `json:"createdAt"`
	UpdatedAt         time.Time  `json:"updatedAt"`
}

func (Account) TableName() string { return "auth_accounts" }

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
