package audit

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)


// Keeps track of who, what, where a specific action occured
type Entry struct {
	ID         uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	TenantID   uuid.UUID       `gorm:"type:uuid;not null;index"`
	BusinessID *uuid.UUID      `gorm:"type:uuid;index"`
	UserID     *uuid.UUID      `gorm:"type:uuid;index"`
	Action     string          `gorm:"not null;index"`
	Resource   string          `gorm:"not null;index"`
	ResourceID string          `gorm:"index"`
	Metadata   json.RawMessage `gorm:"type:jsonb"`
	CreatedAt  time.Time       `gorm:"not null;default:now()"`
}

func (Entry) TableName() string {
	return "audit_log"
}
