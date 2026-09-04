package sales

import (
	"context"
	"database/sql"
	"fmt"
	shareddb "github.com/Codecx-Org/FinAI/backend/internal/shared/db"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/middleware"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/pagination"
	"github.com/Codecx-Org/FinAI/backend/internal/taxes"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
	"log/slog"
	"time"
)

type TaxRecorder interface {
	RecordSaleTax(ctx context.Context, businessID, sourceID uuid.UUID, taxable decimal.Decimal) error
	WithTx(tx *gorm.DB) *taxes.Service
}
type Service struct {
	repo   *Repository
	taxes  TaxRecorder
	outbox *river.Client[*sql.Tx]
	logger *slog.Logger
}

func NewService(repo *Repository, taxes TaxRecorder, outboxRepo *river.Client[*sql.Tx], logger *slog.Logger) *Service {
	if logger == nil {
		logger = slog.Default()
	}
	return &Service{repo: repo, taxes: taxes, outbox: outboxRepo, logger: logger}
}

type SaleLineRequest struct {
	ProductID        uuid.UUID       `json:"productId"`
	ProductVariantID *uuid.UUID      `json:"variantId"`
	Quantity         decimal.Decimal `json:"quantity"`
	UnitPrice        decimal.Decimal `json:"unitPrice"`
}
type CreateSaleRequest struct {
	OrderID       *uuid.UUID        `json:"orderId"`
	CustomerID    *uuid.UUID        `json:"customerId"`
	PaymentMethod string            `json:"paymentMethod"`
	Lines         []SaleLineRequest `json:"lines"`
}
type OrderLineInput struct {
	ProductID        uuid.UUID
	ProductVariantID *uuid.UUID
	Quantity         decimal.Decimal
	UnitPrice        decimal.Decimal
}

func (s *Service) WithTx(tx *gorm.DB) *Service {
	if tx == nil {
		return s
	}

	return &Service{
		repo:   s.repo.WithTx(tx),
		taxes:  s.taxes,
		outbox: s.outbox,
		logger: s.logger,
	}
}

func (s *Service) Create(ctx context.Context, businessID, staffID uuid.UUID, req CreateSaleRequest) (*Sale, error) {
	key, _ := middleware.IdempotencyKeyFromCtx(ctx)
	if key != "" {
		if existing, err := s.repo.FindByIdempotency(ctx, businessID, key); err == nil {
			return existing, nil
		}
	}
	return s.create(ctx, businessID, staffID, req.OrderID, req.CustomerID, req.PaymentMethod, key, toLineInputs(req.Lines))
}

func (s *Service) CreateFromOrder(ctx context.Context, businessID, staffID, orderID uuid.UUID, customerID *uuid.UUID, paymentMethod string, lines []OrderLineInput) (*Sale, error) {
	if existing, err := s.repo.FindByOrder(ctx, businessID, orderID); err == nil {
		return existing, nil
	}
	return s.create(ctx, businessID, staffID, &orderID, customerID, paymentMethod, "", lines)
}

func (s *Service) create(ctx context.Context, businessID, staffID uuid.UUID, orderID, customerID *uuid.UUID, paymentMethod, key string, inputs []OrderLineInput) (*Sale, error) {
	if paymentMethod == "" {
		paymentMethod = "cash"
	}
	receipt, err := s.repo.NextReceipt(ctx, businessID)
	if err != nil {
		return nil, err
	}
	subtotal := decimal.Zero
	lines := make([]SaleLine, 0, len(inputs))
	for _, in := range inputs {
		total := in.Quantity.Mul(in.UnitPrice).Round(2)
		subtotal = subtotal.Add(total)
		lines = append(lines, SaleLine{
			BaseModel: shareddb.BaseModel{
				TenantID: businessID,
			},
			BusinessID:       businessID,
			ProductID:        in.ProductID,
			ProductVariantID: in.ProductVariantID,
			Quantity:         in.Quantity,
			UnitPrice:        in.UnitPrice,
			LineTotal:        total,
		})
	}
	tax := subtotal.Mul(decimal.NewFromFloat(0.16)).Round(2)
	sale := &Sale{
		BaseModel: shareddb.BaseModel{
			TenantID: businessID,
		},
		BusinessID:     businessID,
		OrderID:        orderID,
		CustomerID:     customerID,
		ReceiptNumber:  receipt,
		StaffID:        staffID,
		PaymentMethod:  paymentMethod,
		Subtotal:       subtotal,
		TaxAmount:      tax,
		Total:          subtotal.Add(tax),
		Status:         "completed",
		IdempotencyKey: key,
		SoldAt:         time.Now().UTC(),
	}

	if err := s.repo.db.Transaction(func(tx *gorm.DB) error {
		txSvc := s.WithTx(tx)
		if err := txSvc.repo.Create(ctx, sale, lines); err != nil {
			s.logger.ErrorContext(ctx, "[SALES]-could not create sale", "businessID", businessID.String(), "err", err.Error())
			return err
		}
		if s.taxes != nil {
			if err := s.taxes.WithTx(tx).RecordSaleTax(ctx, businessID, sale.ID, subtotal); err != nil {
				return err
			}
		}
		sqlTx, ok := tx.Statement.ConnPool.(*sql.Tx)
		if !ok {
			return fmt.Errorf("sqlTx not available for sales event")
		}
		return txSvc.emit(ctx, sqlTx, businessID, sale.ID, SaleCreated, map[string]any{"total": sale.Total.String()})
	}); err != nil {
		return nil, err
	}
	s.logger.InfoContext(ctx, "[SALES]-sale created", "saleID", sale.ID.String(), "businessID", businessID.String())
	return s.repo.Find(ctx, businessID, sale.ID)
}

func (s *Service) List(ctx context.Context, businessID uuid.UUID, page pagination.Page) ([]Sale, error) {
	return s.repo.List(ctx, businessID, page)
}

func (s *Service) Get(ctx context.Context, businessID, saleID uuid.UUID) (*Sale, error) {
	return s.repo.Find(ctx, businessID, saleID)
}

func (s *Service) Void(ctx context.Context, businessID, saleID uuid.UUID) error {
	return s.repo.Void(ctx, businessID, saleID)
}

func (s *Service) GetSalesSummary(ctx context.Context, businessID uuid.UUID, from, to time.Time) (Summary, error) {
	return s.repo.Summary(ctx, businessID, from, to)
}

func (s *Service) GetSalesByPaymentMethod(ctx context.Context, businessID uuid.UUID) ([]Breakdown, error) {
	return s.repo.Breakdown(ctx, businessID, "payment_method")
}

func (s *Service) GetSalesByStaff(ctx context.Context, businessID uuid.UUID) ([]Breakdown, error) {
	return s.repo.Breakdown(ctx, businessID, "staff_id")
}

func (s *Service) GetSalesByProduct(ctx context.Context, businessID uuid.UUID) ([]Breakdown, error) {
	return s.repo.ProductBreakdown(ctx, businessID)
}

func toLineInputs(lines []SaleLineRequest) []OrderLineInput {
	out := make([]OrderLineInput, 0, len(lines))
	for _, l := range lines {
		out = append(out, OrderLineInput{
			ProductID:        l.ProductID,
			ProductVariantID: l.ProductVariantID,
			Quantity:         l.Quantity,
			UnitPrice:        l.UnitPrice,
		})
	}
	return out
}
