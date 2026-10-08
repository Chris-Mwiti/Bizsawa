package sales

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"

	"github.com/Codecx-Org/FinAI/backend/internal/inventory"
	shareddb "github.com/Codecx-Org/FinAI/backend/internal/shared/db"
	apperrors "github.com/Codecx-Org/FinAI/backend/internal/shared/errors"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/middleware"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/pagination"
	"github.com/Codecx-Org/FinAI/backend/internal/taxes"
)

type TaxRecorder interface {
	RecordSaleTax(ctx context.Context, businessID, sourceID uuid.UUID, taxable decimal.Decimal) error
	WithTx(tx *gorm.DB) *taxes.Service
}
type Service struct {
	repo      *Repository
	taxes     TaxRecorder
	inventory *inventory.Service
	outbox    *river.Client[*sql.Tx]
	logger    *slog.Logger
}

func NewService(repo *Repository, taxes TaxRecorder, inventory *inventory.Service, outboxRepo *river.Client[*sql.Tx], logger *slog.Logger) *Service {
	if logger == nil {
		logger = slog.Default()
	}

	return &Service{repo: repo, taxes: taxes, inventory: inventory, outbox: outboxRepo, logger: logger}
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
		repo:      s.repo.WithTx(tx),
		taxes:     s.taxes,
		inventory: s.inventory,
		outbox:    s.outbox,
		logger:    s.logger,
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

	// Retry on 23505 duplicate receipt_number: number is generated inside the
	// tx under pg_advisory_xact_lock, but REST+sync writers and nested
	// savepoints can still collide on burst. Regenerate and retry; callers
	// get 409, never a raw 500/SQLSTATE body.
	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		var saleID uuid.UUID
		err := s.repo.db.Transaction(func(tx *gorm.DB) error {
			txSvc := s.WithTx(tx)
			// Lock + MAX(suffix)+1 inside the tx via the tx-bound repo.
			receipt, err := txSvc.repo.NextReceipt(ctx, businessID)
			if err != nil {
				return err
			}

			subtotal := decimal.Zero
			lines := make([]SaleLine, 0, len(inputs))
			for _, in := range inputs {
				total := in.Quantity.Mul(in.UnitPrice).Round(2)
				subtotal = subtotal.Add(total)
				lines = append(lines, SaleLine{
					BaseModel:        shareddb.BaseModel{TenantID: businessID},
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
				BaseModel:      shareddb.BaseModel{TenantID: businessID},
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
			if err := txSvc.repo.Create(ctx, sale, lines); err != nil {
				s.logger.ErrorContext(ctx, "[SALES]-could not create sale", "businessID", businessID.String(), "err", err.Error())
				return err
			}
			if s.taxes != nil {
				if err := s.taxes.WithTx(tx).RecordSaleTax(ctx, businessID, sale.ID, subtotal); err != nil {
					return err
				}
			}
			// Standalone (walk-in) sales deduct inventory here. Order-linked
			// sales are deducted at order confirm instead. DeductForSale is
			// ledger-guarded (reference "sale").
			if orderID == nil && s.inventory != nil {
				deductLines := make([]inventory.DecrementLine, 0, len(lines))
				for _, l := range lines {
					deductLines = append(deductLines, inventory.DecrementLine{ProductID: l.ProductID, Quantity: l.Quantity})
				}
				if err := s.inventory.WithTx(tx).DeductForSale(ctx, businessID, sale.ID, deductLines); err != nil {
					return err
				}
			}
			sqlTx, ok := tx.Statement.ConnPool.(*sql.Tx)
			if !ok {
				return fmt.Errorf("sqlTx not available for sales event")
			}
			if err := txSvc.emit(ctx, sqlTx, businessID, sale.ID, SaleCreated, map[string]any{"total": sale.Total.String()}); err != nil {
				return err
			}
			saleID = sale.ID
			return nil
		})
		if err == nil {
			s.logger.InfoContext(ctx, "[SALES]-sale created", "saleID", saleID.String(), "businessID", businessID.String())
			if err := s.repo.DB().WithContext(ctx).Exec(`DELETE FROM analytics_snapshots WHERE business_id = ?`, businessID).Error; err != nil {
				slog.ErrorContext(ctx, "database operation failed", "err", err)
			}
			return s.repo.Find(ctx, businessID, saleID)
		}
		if shareddb.IsDuplicateKey(err) {
			lastErr = err
			continue
		}
		return nil, err
	}
	s.logger.ErrorContext(ctx, "[SALES]-receipt number contention", "businessID", businessID.String(), "err", lastErr.Error())
	return nil, apperrors.ErrConflict.WithMessage("sale number contention — retry").WithCause(lastErr)
}

func (s *Service) List(ctx context.Context, businessID uuid.UUID, page pagination.Page) ([]Sale, error) {
	return s.repo.List(ctx, businessID, page)
}

func (s *Service) Get(ctx context.Context, businessID, saleID uuid.UUID) (*Sale, error) {
	return s.repo.Find(ctx, businessID, saleID)
}

func (s *Service) Void(ctx context.Context, businessID, saleID uuid.UUID) error {
	err := s.repo.db.Transaction(func(tx *gorm.DB) error {
		// Load with lines so we can put the sold stock back; also lets us treat an
		// already-voided sale as idempotent instead of erroring.
		sale, err := s.repo.WithTx(tx).Find(ctx, businessID, saleID)
		if err != nil {
			return err
		}

		if sale.Status == "void" {
			return nil
		}

		if err := s.repo.WithTx(tx).Void(ctx, businessID, saleID); err != nil {
			return err
		}

		if s.inventory != nil && len(sale.Lines) > 0 {
			restoreLines := make([]inventory.DecrementLine, 0, len(sale.Lines))
			for _, l := range sale.Lines {
				restoreLines = append(restoreLines, inventory.DecrementLine{ProductID: l.ProductID, Quantity: l.Quantity})
			}
			// Ledger-guarded (reference "sale") — only restores what this sale
			// actually deducted (standalone sales), and never twice.
			if err := s.inventory.WithTx(tx).RestoreForSale(ctx, businessID, saleID, restoreLines); err != nil {
				return err
			}
		}

		return nil
	})

	if err == nil {
		if err := s.repo.DB().WithContext(ctx).Exec(`DELETE FROM analytics_snapshots WHERE business_id = ?`, businessID).Error; err != nil {
			slog.ErrorContext(ctx, "database operation failed", "err", err)
		}
	}

	return err
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
		out = append(out, OrderLineInput(l))
	}

	return out
}
