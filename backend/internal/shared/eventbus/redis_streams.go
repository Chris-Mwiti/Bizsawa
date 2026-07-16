package eventbus

import (
	"context"

	"github.com/redis/go-redis/v9"
)

type RedisStreamsBus struct {
	client *redis.Client
}

func NewRedisStreamsBus(client *redis.Client) *RedisStreamsBus {
	return &RedisStreamsBus{client: client}
}

func (b *RedisStreamsBus) Publish(ctx context.Context, stream string, event Event) error {
	return b.client.XAdd(ctx, &redis.XAddArgs{
		Stream: stream,
		Values: map[string]any{
			"id":             event.ID.String(),
			"tenant_id":      event.TenantID.String(),
			"aggregate_id":   event.AggregateID,
			"aggregate_type": event.AggregateType,
			"type":           event.Type,
			"payload":        string(event.Payload),
			"occurred_at":    event.OccurredAt.Format("2006-01-02T15:04:05.999999999Z07:00"),
		},
	}).Err()
}
