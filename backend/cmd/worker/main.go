package main

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/Codecx-Org/FinAI/backend/internal/shared/cache"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/config"
	shareddb "github.com/Codecx-Org/FinAI/backend/internal/shared/db"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/eventbus"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/outbox"
)

func main() {
	cfg := config.Load()
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	gormDB, err := shareddb.Open(cfg.Database)
	if err != nil {
		logger.Error("database open failed", "err", err)
		os.Exit(1)
	}

	redisClient := cache.NewRedis(cfg.Redis)
	defer redisClient.Close()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	//relay events to the internal database for writes. Snapshot of how to prevent double writes
	relay := outbox.NewRelay(
		outbox.NewRepository(gormDB),
		eventbus.NewRedisStreamsBus(redisClient.Raw()),
		outbox.RelayConfig{DefaultStream: "events"},
		logger,
	)

	logger.Info("worker starting", "role", "outbox-relay")
	if err := relay.Start(ctx); err != nil && !errors.Is(err, context.Canceled) {
		logger.Error("worker stopped with error", "err", err)
		os.Exit(1)
	}
}
