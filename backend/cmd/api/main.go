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
	"github.com/Codecx-Org/FinAI/backend/internal/taxes"
	"github.com/Codecx-Org/FinAI/backend/internal/tenancy"
	"github.com/Codecx-Org/FinAI/backend/internal/users"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverdatabasesql"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"golang.org/x/sync/errgroup"
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
	sqlDB, err := shareddb.SQLDB(gormDB)
	if err != nil {
		logger.Error("database sql pool unavailable", "err", err)
		os.Exit(1)
	}

	riverIngester, err := river.NewClient(riverdatabasesql.New(sqlDB), &river.Config{})
	if err != nil {
		logger.Error("river ingester initialization failed", "err", err)
		os.Exit(1)
	}

	pgxConfig, err := pgxpool.ParseConfig(cfg.Database.DSN)
	if err != nil {
		logger.Error("river pgx config parse failed", "err", err)
		os.Exit(1)
	}
	pgxConfig.MaxConns = 10

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pgxPool, err := pgxpool.NewWithConfig(ctx, pgxConfig)
	if err != nil {
		logger.Error("river pgx pool initialization failed", "err", err)
		os.Exit(1)
	}
	defer pgxPool.Close()

	redisClient := cache.NewRedis(cfg.Redis)
	defer redisClient.Close()

	cryptoManager, err := sharedcrypto.NewManager([]byte(cfg.Crypto.MasterKey), []byte(cfg.Crypto.IndexSecret))
	if err != nil {
		logger.Error("crypto manager initialization failed", "err", err)
		os.Exit(1)
	}

	tenancyModule := tenancy.New(gormDB)
	usersModule := users.New(gormDB)
	authModule := auth.New(gormDB, auth.Config{SigningKey: cfg.JWT.SigningKey, Issuer: cfg.JWT.Issuer, AccessTTL: 90 * time.Minute, RefreshTTL: 30 * 24 * time.Hour}, auth.WithMembershipResolver(usersModule), auth.WithSubscriptionProvisioner(tenancyModule))
	businessModule := business.New(gormDB, tenancyModule, usersModule, cryptoManager)
	productsModule := products.New(gormDB)
	customersModule := customers.New(gormDB)
	taxesModule := taxes.New(gormDB)
	inventoryModule := inventory.New(gormDB)
	salesModule := sales.New(gormDB, taxesModule.Service(), riverIngester, logger)
	expensesModule := expenses.New(gormDB, taxesModule.Service())
	invoicesModule := invoices.New(gormDB, riverIngester, logger)
	paymentsModule := payments.New(gormDB, riverIngester, logger, payments.NewMpesaClient(cfg.Mpesa, logger))
	ordersModule := orders.New(gormDB, inventoryModule.Service(), salesModule.Service(), riverIngester, customersModule.Service(), invoicesModule.Service(), paymentsModule.Service(), logger)
	authzEnforcer := authz.NewEnforcer(usersModule)

	workers := river.NewWorkers()
	salesModule.RegisterWorkers(workers)
	invoicesModule.RegisterWorkers(workers)
	paymentsModule.RegisterWorkers(workers)
	ordersModule.RegisterWorkers(workers)

	riverWorkerEngine, err := river.NewClient(riverpgxv5.New(pgxPool), &river.Config{
		Workers: workers,
		Queues: map[string]river.QueueConfig{
			river.QueueDefault: {MaxWorkers: 10},
		},
	})
	if err != nil {
		logger.Error("river worker engine initialization failed", "err", err)
		os.Exit(1)
	}

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

	g, groupCtx := errgroup.WithContext(ctx)

	g.Go(func() error {
		logger.Info("api listening", "addr", cfg.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			return err
		}
		return nil
	})

	g.Go(func() error {
		logger.Info("river worker engine listening")
		return riverWorkerEngine.Start(groupCtx)
	})

	g.Go(func() error {
		<-groupCtx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
		defer cancel()
		if err := srv.Shutdown(shutdownCtx); err != nil {
			return err
		}
		return riverWorkerEngine.Stop(shutdownCtx)
	})

	if err := g.Wait(); err != nil && !errors.Is(err, context.Canceled) {
		logger.Error("system shutdown with error", "err", err)
		os.Exit(1)
	}
}
