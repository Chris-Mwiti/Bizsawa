package business

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Business struct {
	ID                       uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID                 uuid.UUID      `gorm:"type:uuid;not null;index" json:"tenantId"`
	OwnerID                  uuid.UUID      `gorm:"type:uuid;not null;index" json:"ownerId"`
	Name                     string         `gorm:"not null" json:"name"`
	Slug                     string         `gorm:"not null;uniqueIndex" json:"slug"`
	Currency                 string         `gorm:"not null;default:'KES'" json:"currency"`
	Timezone                 string         `gorm:"not null;default:'Africa/Nairobi'" json:"timezone"`
	TaxPIN                   string         `json:"taxPin"`
	Phone                    string         `json:"phone"`
	Email                    string         `json:"email"`
	Address                  string         `json:"address"`
	MpesaPaymentType         string         `gorm:"type:text" json:"mpesaPaymentType"`
	MpesaShortcodeConfigured bool           `gorm:"-" json:"mpesaShortcodeConfigured"`
	MpesaShortcodeEnc        string         `gorm:"column:mpesa_shortcode_encrypted;type:text" json:"-"`
	MpesaShortcodeIndex      string         `gorm:"column:mpesa_shortcode_index;type:text;index" json:"-"`
	CreatedAt                time.Time      `json:"createdAt"`
	UpdatedAt                time.Time      `json:"updatedAt"`
	DeletedAt                gorm.DeletedAt `gorm:"index" json:"-"`
}

func (Business) TableName() string { return "businesses" }
