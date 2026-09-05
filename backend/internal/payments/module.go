package payments

import (
	"database/sql"
	"log/slog"

	"github.com/go-chi/chi/v5"
	"github.com/riverqueue/river"
	"gorm.io/gorm"
)

type Module struct {
	repo           *Repository
	svc            *Service
	logger         *slog.Logger
	orderService   OrderPayment
	invoiceService InvoicePayment
}

func New(db *gorm.DB, outboxRepo *river.Client[*sql.Tx], logger *slog.Logger, provider Provider, orderService OrderPayment, invoiceService InvoicePayment) *Module {
	if logger == nil {
		logger = slog.Default()
	}

	repo := NewRepository(db)

	return &Module{
		repo:           repo,
		svc:            NewService(repo, outboxRepo, logger, provider),
		logger:         logger,
		orderService:   orderService,
		invoiceService: invoiceService,
	}
}

func (m *Module) RegisterRoutes(r chi.Router) {
	h := Handler{svc: m.svc}
	r.Get("/", h.List)
	r.Post("/", h.Initiate)
	r.Get("/{id}", h.Get)
	r.Post("/mpesa/c2b/register", h.RegisterC2BURLs)
	r.Post("/mpesa/transaction-status", h.QueryTransactionStatus)
}

func (m *Module) RegisterPublicRoutes(r chi.Router) {
	h := Handler{svc: m.svc}
	r.Post("/stk/callback", h.MpesaCallback)
	r.Post("/c2b/confirmation", h.MpesaCallback)
	r.Post("/c2b/validation", h.MpesaValidation)
	r.Post("/b2c/result", h.MpesaCallback)
	r.Post("/timeout", h.MpesaCallback)
}

func (m *Module) RegisterWorkers(workers *river.Workers) {
	river.AddWorker(workers, &paymentWorker{service: m.svc, orderService: m.orderService, invoiceService: m.invoiceService, logger: m.logger})
}

func (m *Module) Service() *Service { return m.svc }
