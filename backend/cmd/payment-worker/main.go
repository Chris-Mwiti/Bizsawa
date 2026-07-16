package main

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Codecx-Org/FinAI/backend/internal/payments"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/cache"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/circuitbreaker"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/config"
	shareddb "github.com/Codecx-Org/FinAI/backend/internal/shared/db"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/outbox"
)

type Provider interface {
	Execute(ctx context.Context, cmd payments.PaymentCommand) (payments.ProviderResult, error)
}

type MpesaProvider struct{}

func (p MpesaProvider) Execute(ctx context.Context, cmd payments.PaymentCommand) (payments.ProviderResult, error) {
	if cmd.Phone == "" && cmd.Type == payments.CommandSTKPush {
		return payments.ProviderResult{}, errors.New("phone is required for stk push")
	}
	return payments.ProviderResult{RequestID: "mpesa-" + cmd.ID.String(), Receipt: "SIM-" + cmd.ID.String()[:8]}, nil
}

type Worker struct {
	logger   *slog.Logger
	service  *payments.Service
	provider Provider
}

func (w Worker) Run(ctx context.Context) error {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		if err := w.process(ctx); err != nil {
			w.logger.Error("payment command processing failed", "err", err)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
		}
	}
}

func (w Worker) process(ctx context.Context) error {
	commands, err := w.service.ClaimPending(ctx, 25)
	if err != nil {
		return err
	}
	for _, cmd := range commands {
		result, err := w.provider.Execute(ctx, cmd)
		if err != nil {
			if markErr := w.service.MarkFailed(ctx, cmd, "PROVIDER_ERROR", providerMessage(err), nil); markErr != nil {
				return markErr
			}
			continue
		}
		if err := w.service.MarkSucceeded(ctx, cmd, result); err != nil {
			return err
		}
	}
	return nil
}

func providerMessage(err error) string {
	if err == nil {
		return ""
	}
	return "payment provider command failed"
}

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

	outboxRepo := outbox.NewRepository(gormDB)
	paymentModule := payments.New(gormDB, outboxRepo)
	breaker := circuitbreaker.New[payments.ProviderResult](circuitbreaker.Config{Name: "mpesa-daraja", Logger: logger})
	provider := MpesaProvider{}
	worker := Worker{logger: logger, service: paymentModule.Service(), provider: ProviderFunc(func(ctx context.Context, cmd payments.PaymentCommand) (payments.ProviderResult, error) {
		return breaker.Execute(func() (payments.ProviderResult, error) { return provider.Execute(ctx, cmd) })
	})}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	logger.Info("payment worker ready", "env", cfg.Env, "stream", "payments.commands")
	if err := redisClient.Ping(ctx); err != nil {
		logger.Warn("redis ping failed", "err", err)
	}
	if err := worker.Run(ctx); err != nil && !errors.Is(err, context.Canceled) {
		logger.Error("payment worker stopped with error", "err", err)
		os.Exit(1)
	}
	logger.Info("payment worker stopped")
}

type ProviderFunc func(context.Context, payments.PaymentCommand) (payments.ProviderResult, error)

func (f ProviderFunc) Execute(ctx context.Context, cmd payments.PaymentCommand) (payments.ProviderResult, error) {
	return f(ctx, cmd)
}
