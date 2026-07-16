package idempotency

import (
	"context"
	"time"

	"github.com/Codecx-Org/FinAI/backend/internal/shared/cache"
)

type Store struct {
	cache cache.Client
	ttl   time.Duration
}

func NewStore(cache cache.Client, ttl time.Duration) *Store {
	if ttl == 0 {
		ttl = 24 * time.Hour
	}
	return &Store{cache: cache, ttl: ttl}
}

func (s *Store) Get(ctx context.Context, key string) (string, error) {
	return s.cache.Get(ctx, "idem:"+key)
}

func (s *Store) Set(ctx context.Context, key string, response string) error {
	return s.cache.Set(ctx, "idem:"+key, response, s.ttl)
}
