package outbox

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type Status string

const (
	StatusPending    Status = "PENDING"
	StatusProcessing Status = "PROCESSING"
	StatusSent       Status = "SENT"
	StatusDead       Status = "DEAD"
)

type Event struct {
	ID            uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	TenantID      uuid.UUID       `gorm:"type:uuid;not null;index"`
	AggregateID   string          `gorm:"not null"`
	AggregateType string          `gorm:"not null"`
	EventType     string          `gorm:"not null"`
	Stream        string          `gorm:"not null;default:events"`
	Payload       json.RawMessage `gorm:"type:jsonb;not null"`
	Status        Status          `gorm:"type:text;not null;default:'PENDING';index"`
	Attempts      int             `gorm:"not null;default:0"`
	MaxAttempts   int             `gorm:"not null;default:5"`
	ScheduledAt   time.Time       `gorm:"not null;default:now();index"`
	SentAt        *time.Time
	CreatedAt     time.Time `gorm:"not null;default:now()"`
}

func (Event) TableName() string {
	return "outbox_events"
}
