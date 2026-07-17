package eventbus

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/redis/go-redis/v9"
)

type RedisStreamsBus struct {
	client *redis.Client
}

func NewRedisStreamsBus(client *redis.Client) *RedisStreamsBus {
	return &RedisStreamsBus{client: client}
}

type EventHandlerFunc func(ctx context.Context, fields map[string]string) error

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

func (b *RedisStreamsBus) Subscribe(ctx context.Context, stream, targetType string, evtHandFun EventHandlerFunc) error {
	lastId := "$"

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
			// Hidden character removed here
		}

		streams, err := b.client.XRead(ctx, &redis.XReadArgs{
			Streams: []string{stream, lastId},
			Count:   10,
			Block:   2 * time.Second,
		}).Result()

		if err != nil {
			if err == redis.Nil {
				continue
			}
			return fmt.Errorf("failed to read from event stream: %w", err)
		}

		for _, s := range streams {
			for _, message := range s.Messages { // 1. Capitalized Messages

				// 2. Consistent casing: lastId and message.ID
				lastId = message.ID 

				// 3. Capitalized Values
				rawType, ok := message.Values["type"] 
				if !ok {
					continue
				}

				eventType, ok := rawType.(string)
				// 4. Consistent casing: targetType
				if !ok || eventType != targetType { 
					continue
				}

				eventData := make(map[string]string)
				for k, v := range message.Values { // 3. Capitalized Values
					if strVal, ok := v.(string); ok {
						eventData[k] = strVal
					}
				} // Closes key-value parser

				// 5. CRITICAL BUG FIX: Execute the business logic *OUTSIDE* the key-value loop!
				if err := evtHandFun(ctx, eventData); err != nil {
					// 6. Fixed slog.Warn casing, err.Error() typo, and structured logging syntax
					slog.Warn("error while subscribing to event queue", "stream", stream, "error", err)
					return err
				} 
			}
		}
	} // 7. Added missing loop closure brace so it runs infinitely
}
