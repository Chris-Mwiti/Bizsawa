package eventbus

import (
	"context"
	"encoding/json"
	"fmt"
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
	Subscribe(ctx context.Context, stream, targetType string, evtHandFun EventHandlerFunc) error
}

// MapToEvent converts raw Redis stream string fields back into your domain Event struct
func MapToEvent(fields map[string]string) (Event, error) {
	var event Event
	var err error

	if idStr, exists := fields["id"]; exists && idStr != "" {
		event.ID, err = uuid.Parse(idStr)
		if err != nil {
			return Event{}, fmt.Errorf("invalid event id: %w", err)
		}
	}

	if tenantStr, exists := fields["tenant_id"]; exists && tenantStr != "" {
		event.TenantID, err = uuid.Parse(tenantStr)
		if err != nil {
			return Event{}, fmt.Errorf("invalid tenant id: %w", err)
		}
	}

	event.AggregateID = fields["aggregate_id"]
	event.AggregateType = fields["aggregate_type"]
	event.Type = fields["type"]

	if payloadStr, exists := fields["payload"]; exists {
		event.Payload = []byte(payloadStr)
	}

	if timeStr, exists := fields["occurred_at"]; exists && timeStr != "" {
		event.OccurredAt, err = time.Parse(time.RFC3339Nano, timeStr)
		if err != nil {
			return Event{}, fmt.Errorf("invalid occurred_at timestamp: %w", err)
		}
	}

	return event, nil
}

