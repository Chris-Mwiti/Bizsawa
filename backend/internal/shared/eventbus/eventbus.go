package eventbus

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type Event struct {
	ID            uuid.UUID       `json:"id"`
	TenantID      uuid.UUID       `json:"tenantId"`
	AggregateID   string          `json:"aggregateId"`
	AggregateType string          `json:"aggregateType"`
	Type          string          `json:"type"`
	Payload       json.RawMessage `json:"payload"`
	OccurredAt    time.Time       `json:"occurredAt"`
}

type Bus interface {
	Publish(ctx context.Context, stream string, event Event) error
}
