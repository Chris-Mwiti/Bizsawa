package main

import (
	"net/http"
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
	"github.com/Codecx-Org/FinAI/backend/internal/shared/config"
	sharedhttp "github.com/Codecx-Org/FinAI/backend/internal/shared/http"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/middleware"
	"github.com/Codecx-Org/FinAI/backend/internal/taxes"
	"github.com/Codecx-Org/FinAI/backend/internal/tenancy"
	"github.com/Codecx-Org/FinAI/backend/internal/users"
	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

type Dependencies struct {
	Config    config.Config
	Ready     func(*http.Request) error
	Auth      *auth.Module
	Tenancy   *tenancy.Module
	Business  *business.Module
	Users     *users.Module
	Products  *products.Module
	Customers *customers.Module
	Taxes     *taxes.Module
	Inventory *inventory.Module
	Orders    *orders.Module
	Sales     *sales.Module
	Expenses  *expenses.Module
	Invoices  *invoices.Module
	Payments  *payments.Module
	Authz     *authz.Enforcer
}

func NewRouter(deps Dependencies) http.Handler {
	r := chi.NewRouter()

	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.RealIP)
	r.Use(chimiddleware.Logger)
	r.Use(chimiddleware.Recoverer)
	r.Use(chimiddleware.Timeout(60 * time.Second))
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   deps.Config.CORS.AllowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Idempotency-Key", "X-Request-ID", "X-Business-ID"},
		AllowCredentials: true,
		MaxAge:           300,
	}))
	r.Use(middleware.TenantResolution)
	r.Use(middleware.Idempotency)

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"status": "ok"})
	})

	r.Get("/ready", func(w http.ResponseWriter, r *http.Request) {
		if deps.Ready != nil {
			if err := deps.Ready(r); err != nil {
				sharedhttp.JSON(w, http.StatusServiceUnavailable, sharedhttp.Envelope{"status": "not_ready"})
				return
			}
		}
		sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"status": "ready"})
	})

	r.Route("/api/v1", func(r chi.Router) {
		r.Get("/status", func(w http.ResponseWriter, r *http.Request) {
			sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"service": "bizsawa-api", "phase": "invoices-payments"})
		})

		if deps.Auth != nil {
			r.Route("/auth", deps.Auth.RegisterRoutes)
		}
		if deps.Tenancy != nil {
			r.Route("/public", deps.Tenancy.RegisterPublicRoutes)
		}

		r.Group(func(r chi.Router) {
			if deps.Auth != nil {
				r.Use(deps.Auth.Middleware)
			}
			if deps.Tenancy != nil {
				r.Route("/subscriptions", deps.Tenancy.RegisterRoutes)
			}
			if deps.Users != nil {
				r.Route("/profile", deps.Users.RegisterProfileRoutes)
			}
			if deps.Business != nil {
				r.Route("/businesses", deps.Business.RegisterRoutes)
			}
		})

		r.Group(func(r chi.Router) {
			if deps.Auth != nil {
				r.Use(deps.Auth.Middleware)
			}
			if deps.Authz != nil {
				r.Use(deps.Authz.Middleware)
			}
			if deps.Users != nil {
				r.Route("/businesses/{businessID}/members", deps.Users.RegisterRoutes)
			}
			if deps.Products != nil {
				r.Route("/products", deps.Products.RegisterRoutes)
			}
			if deps.Customers != nil {
				r.Route("/customers", deps.Customers.RegisterRoutes)
			}
			if deps.Taxes != nil {
				r.Route("/taxes", deps.Taxes.RegisterRoutes)
			}
			if deps.Inventory != nil {
				r.Route("/inventory", deps.Inventory.RegisterRoutes)
			}
			if deps.Orders != nil {
				r.Route("/orders", deps.Orders.RegisterRoutes)
			}
			if deps.Sales != nil {
				r.Route("/sales", deps.Sales.RegisterRoutes)
			}
			if deps.Expenses != nil {
				r.Route("/expenses", deps.Expenses.RegisterRoutes)
			}
			if deps.Invoices != nil {
				r.Route("/invoices", deps.Invoices.RegisterRoutes)
			}
			if deps.Payments != nil {
				r.Route("/payments", deps.Payments.RegisterRoutes)
			}
		})
	})

	return r
}
