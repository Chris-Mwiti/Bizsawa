package circuitbreaker

import (
	"log/slog"
	"time"

	"github.com/sony/gobreaker/v2"
)

type Config struct {
	Name        string
	MaxRequests uint32
	Interval    time.Duration
	Timeout     time.Duration
	FailureRate float64
	MinRequests uint32
	Logger      *slog.Logger
}

func New[T any](cfg Config) *gobreaker.CircuitBreaker[T] {
	if cfg.MaxRequests == 0 {
		cfg.MaxRequests = 3
	}
	if cfg.Interval == 0 {
		cfg.Interval = time.Minute
	}
	if cfg.Timeout == 0 {
		cfg.Timeout = 30 * time.Second
	}
	if cfg.FailureRate == 0 {
		cfg.FailureRate = 0.6
	}
	if cfg.MinRequests == 0 {
		cfg.MinRequests = 5
	}
	logger := cfg.Logger
	if logger == nil {
		logger = slog.Default()
	}

	return gobreaker.NewCircuitBreaker[T](gobreaker.Settings{
		Name:        cfg.Name,
		MaxRequests: cfg.MaxRequests,
		Interval:    cfg.Interval,
		Timeout:     cfg.Timeout,
		ReadyToTrip: func(counts gobreaker.Counts) bool {
			if counts.Requests < cfg.MinRequests {
				return false
			}
			return float64(counts.TotalFailures)/float64(counts.Requests) >= cfg.FailureRate
		},
		OnStateChange: func(name string, from, to gobreaker.State) {
			logger.Warn("circuit breaker state change", "name", name, "from", from.String(), "to", to.String())
		},
	})
}
