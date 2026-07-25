package outbox

import "github.com/google/uuid"
type BaseModel[T any] struct {
	TenantID uuid.UUID `json:"tenantID"`
	AggregateID string `json:"aggregateID"`
	AggregateType string `json:"aggregateType"`
	Stream				string  `json:"stream"`
	EventType			T  			`json:"eventType"`	
} 
