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

	"github.com/Codecx-Org/FinAI/backend/internal/auth"
	"github.com/Codecx-Org/FinAI/backend/internal/business"
	"github.com/Codecx-Org/FinAI/backend/internal/customers"
	"github.com/Codecx-Org/FinAI/backend/internal/expenses"
	"github.com/Codecx-Org/FinAI/backend/internal/inventory"
	"github.com/Codecx-Org/FinAI/backend/internal/invoices"
	"github.com/Codecx-Org/FinAI/backend/internal/orders"
	"github.com/Codecx-Org/FinAI/backend/internal/payments"
	"github.com/Codecx-Org/FinAI/backend/internal/products"
	"github.com/Codecx-Org/FinAI/backend/internal/sales"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/authz"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/cache"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/config"
	sharedcrypto "github.com/Codecx-Org/FinAI/backend/internal/shared/crypto"
	shareddb "github.com/Codecx-Org/FinAI/backend/internal/shared/db"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/outbox"
	"github.com/Codecx-Org/FinAI/backend/internal/taxes"
	"github.com/Codecx-Org/FinAI/backend/internal/tenancy"
	"github.com/Codecx-Org/FinAI/backend/internal/users"
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

	cryptoManager, err := sharedcrypto.NewManager([]byte(cfg.Crypto.MasterKey), []byte(cfg.Crypto.IndexSecret))
	if err != nil {
		logger.Error("crypto manager initialization failed", "err", err)
		os.Exit(1)
	}

	tenancyModule := tenancy.New(gormDB)
	usersModule := users.New(gormDB)
	authModule := auth.New(gormDB, auth.Config{SigningKey: cfg.JWT.SigningKey, Issuer: cfg.JWT.Issuer, AccessTTL: 15 * time.Minute, RefreshTTL: 30 * 24 * time.Hour}, auth.WithMembershipResolver(usersModule), auth.WithSubscriptionProvisioner(tenancyModule))
	businessModule := business.New(gormDB, tenancyModule, usersModule, cryptoManager)
	productsModule := products.New(gormDB)
	customersModule := customers.New(gormDB)
	outboxRepo := outbox.NewRepository(gormDB)
	taxesModule := taxes.New(gormDB)
	inventoryModule := inventory.New(gormDB)
	salesModule := sales.New(gormDB, taxesModule.Service(), outboxRepo)
	ordersModule := orders.New(gormDB, inventoryModule.Service(), salesModule.Service(), outboxRepo)
	expensesModule := expenses.New(gormDB, taxesModule.Service())
	invoicesModule := invoices.New(gormDB, outboxRepo)
	paymentsModule := payments.New(gormDB, outboxRepo)
	authzEnforcer := authz.NewEnforcer(usersModule)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	srv := &http.Server{
		Addr: cfg.Addr,
		Handler: NewRouter(Dependencies{
			Config: cfg,
			Ready: func(r *http.Request) error {
				if err := shareddb.Ping(r.Context(), gormDB); err != nil {
					return err
				}
				return redisClient.Ping(r.Context())
			},
			Auth:      authModule,
			Tenancy:   tenancyModule,
			Business:  businessModule,
			Users:     usersModule,
			Products:  productsModule,
			Customers: customersModule,
			Taxes:     taxesModule,
			Inventory: inventoryModule,
			Orders:    ordersModule,
			Sales:     salesModule,
			Expenses:  expensesModule,
			Invoices:  invoicesModule,
			Payments:  paymentsModule,
			Authz:     authzEnforcer,
		}),
	}

	go func() {
		logger.Info("api listening", "addr", cfg.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("api server failed", "err", err)
			stop()
		}
	}()

	<-ctx.Done()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error("api shutdown failed", "err", err)
		os.Exit(1)
	}
}
