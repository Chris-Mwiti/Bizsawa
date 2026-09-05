package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"golang.org/x/sync/errgroup"

	"github.com/Codecx-Org/FinAI/backend/internal/auth"
	"github.com/Codecx-Org/FinAI/backend/internal/business"
	"github.com/Codecx-Org/FinAI/backend/internal/customers"
	"github.com/Codecx-Org/FinAI/backend/internal/expenses"
	"github.com/Codecx-Org/FinAI/backend/internal/inventory"
	"github.com/Codecx-Org/FinAI/backend/internal/invoices"
	"github.com/Codecx-Org/FinAI/backend/internal/mcp"
	"github.com/Codecx-Org/FinAI/backend/internal/sales"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/authz"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/cache"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/config"
	sharedcrypto "github.com/Codecx-Org/FinAI/backend/internal/shared/crypto"
	shareddb "github.com/Codecx-Org/FinAI/backend/internal/shared/db"
	"github.com/Codecx-Org/FinAI/backend/internal/taxes"
	"github.com/Codecx-Org/FinAI/backend/internal/tenancy"
	"github.com/Codecx-Org/FinAI/backend/internal/users"
)

func main() {
	cfg := config.Load()
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	gormDB, err := shareddb.Open(cfg.Database)
	if err != nil {
		logger.Error("database open failed", "err", err)
		os.Exit(1)
	}

	redisClient := cache.NewRedis(cfg.Redis)
	defer redisClient.Close()

	cryptoManager, err := sharedcrypto.NewManager([]byte(cfg.Crypto.MasterKey), []byte(cfg.Crypto.IndexSecret))
	if err != nil {
		logger.Error("crypto manager initialization failed", "err", err)
		os.Exit(1)
	}

	taxesModule := taxes.New(gormDB)
	tenantModule := tenancy.New(gormDB)
	usersModule := users.New(gormDB)
	_ = auth.New(gormDB, auth.Config{SigningKey: cfg.JWT.SigningKey, Issuer: cfg.JWT.Issuer, AccessTTL: 90 * time.Minute, RefreshTTL: 30 * 24 * time.Hour}, auth.WithMembershipResolver(usersModule), auth.WithSubscriptionProvisioner(tenantModule))
	_ = business.New(gormDB, tenantModule, usersModule, cryptoManager)
	customersModule := customers.New(gormDB)
	inventoryModule := inventory.New(gormDB)
	salesModule := sales.New(gormDB, taxesModule.Service(), nil, logger)
	expensesModule := expenses.New(gormDB, taxesModule.Service())
	invoicesModule := invoices.New(gormDB, nil, logger)
	authzEnforcer := authz.NewEnforcer(usersModule)

	registry := mcp.NewDefaultRegistry(authzEnforcer, mcp.Services{
		Sales:     salesModule.Service(),
		Inventory: inventoryModule.Service(),
		Customers: customersModule.Service(),
		Expenses:  expensesModule.Service(),
		Invoices:  invoicesModule.Service(),
	})

	mcpServer := mcp.NewServer(cfg, mcp.NewAuthenticator(cfg.JWT, cfg.MCP), registry, func(r *http.Request) error {
		if err := shareddb.Ping(r.Context(), gormDB); err != nil {
			return err
		}

		return redisClient.Ping(r.Context())
	})

	srv := &http.Server{Addr: cfg.MCP.Addr, Handler: mcpServer.Router()}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	g, groupCtx := errgroup.WithContext(ctx)
	g.Go(func() error {
		logger.Info("mcp server listening", "addr", cfg.MCP.Addr)

		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			return err
		}

		return nil
	})
	g.Go(func() error {
		<-groupCtx.Done()

		shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
		defer cancel()

		return srv.Shutdown(shutdownCtx)
	})

	if err := g.Wait(); err != nil && !errors.Is(err, context.Canceled) {
		logger.Error("mcp server shutdown with error", "err", err)
		os.Exit(1)
	}
}
