package cache

import (
	"context"
	"time"

	"github.com/Codecx-Org/FinAI/backend/internal/shared/config"
	"github.com/redis/go-redis/v9"
)

type Client interface {
	Get(ctx context.Context, key string) (string, error)
	Set(ctx context.Context, key string, value any, ttl time.Duration) error
	Del(ctx context.Context, keys ...string) error
	Ping(ctx context.Context) error
}

type RedisClient struct {
	client *redis.Client
}

func NewRedis(cfg config.RedisConfig) *RedisClient {
	return &RedisClient{
		client: redis.NewClient(&redis.Options{
			Addr:     cfg.Addr,
			Password: cfg.Password,
			DB:       cfg.DB,
		}),
	}
}

func (c *RedisClient) Raw() *redis.Client {
	return c.client
}

func (c *RedisClient) Get(ctx context.Context, key string) (string, error) {
	return c.client.Get(ctx, key).Result()
}

func (c *RedisClient) Set(ctx context.Context, key string, value any, ttl time.Duration) error {
	return c.client.Set(ctx, key, value, ttl).Err()
}

func (c *RedisClient) Del(ctx context.Context, keys ...string) error {
	return c.client.Del(ctx, keys...).Err()
}

func (c *RedisClient) Ping(ctx context.Context) error {
	return c.client.Ping(ctx).Err()
}

func (c *RedisClient) Close() error {
	return c.client.Close()
}
