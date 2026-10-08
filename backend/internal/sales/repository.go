package sales

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	shareddb "github.com/Codecx-Org/FinAI/backend/internal/shared/db"
	apperrors "github.com/Codecx-Org/FinAI/backend/internal/shared/errors"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/pagination"
)

type Repository struct{ db *gorm.DB }

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

func (r *Repository) DB() *gorm.DB { return r.db }

func (r *Repository) WithTx(tx *gorm.DB) *Repository {
	if tx == nil {
		return r
	}

	return &Repository{
		db: tx,
	}
}

func (r *Repository) FindByIdempotency(ctx context.Context, businessID uuid.UUID, key string) (*Sale, error) {
	var sale Sale

	err := r.db.WithContext(ctx).Scopes(shareddb.BusinessScope(businessID)).Preload("Lines").Where("idempotency_key = ?", key).First(&sale).Error
	if err != nil {
		return nil, err
	}

	return &sale, nil
}

func (r *Repository) FindByOrder(ctx context.Context, businessID, orderID uuid.UUID) (*Sale, error) {
	var sale Sale

	err := r.db.WithContext(ctx).Scopes(shareddb.BusinessScope(businessID)).Preload("Lines").Where("order_id = ?", orderID).First(&sale).Error
	if err != nil {
		return nil, err
	}

	return &sale, nil
}

func (r *Repository) NextReceipt(ctx context.Context, businessID uuid.UUID) (string, error) {
	// Serialise numbering per business. When called inside a tx the lock is
	// held until commit; when called outside a tx it still guards the
	// read-max-then-format window on this connection as best effort.
	// Best effort: not in a tx-capable context here, ignore lock errors on
	// plain *sql.DB paths — callers inside a tx pass the tx-bound repo.
	_ = shareddb.LockBusinessSequence(ctx, r.db, businessID, shareddb.AdvisoryKeySales)

	// MAX(suffix) instead of COUNT(*) so deleted/voided rows never cause
	// number reuse. Suffix is the trailing digits of R-<biz8>-NNNNNN.
	var maxSuffix int64
	if err := r.db.WithContext(ctx).Raw(
		`SELECT COALESCE(MAX(CAST(substring(receipt_number from '([0-9]+)$') AS BIGINT)), 0) FROM sales WHERE business_id = ? AND deleted_at IS NULL`,
		businessID,
	).Scan(&maxSuffix).Error; err != nil {
		return "", err
	}

	return fmt.Sprintf("R-%s-%06d", businessID.String()[:8], maxSuffix+1), nil
}

func (r *Repository) Create(ctx context.Context, sale *Sale, lines []SaleLine) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(sale).Error; err != nil {
			return err
		}

		for i := range lines {
			lines[i].SaleID = sale.ID
		}

		if len(lines) > 0 {
			return tx.Create(&lines).Error
		}

		return nil
	})
}

func (r *Repository) Find(ctx context.Context, businessID, saleID uuid.UUID) (*Sale, error) {
	var sale Sale

	err := r.db.WithContext(ctx).Scopes(shareddb.BusinessScope(businessID)).Preload("Lines").Where("id = ?", saleID).First(&sale).Error
	if err != nil {
		return nil, err
	}

	return &sale, nil
}

func (r *Repository) List(ctx context.Context, businessID uuid.UUID, page pagination.Page) ([]Sale, error) {
	var items []Sale

	err := r.db.WithContext(ctx).Scopes(shareddb.BusinessScope(businessID)).Preload("Lines").Order("sold_at DESC").Limit(page.Limit).Offset(page.Offset).Find(&items).Error

	return items, err
}

func (r *Repository) Void(ctx context.Context, businessID, saleID uuid.UUID) error {
	res := r.db.WithContext(ctx).Scopes(shareddb.BusinessScope(businessID)).Model(&Sale{}).Where("id = ? AND status <> 'void'", saleID).Update("status", "void")
	if res.Error != nil {
		return res.Error
	}

	if res.RowsAffected == 0 {
		return apperrors.ErrNotFound.WithMessage("sale not found")
	}

	return nil
}

func (r *Repository) Summary(ctx context.Context, businessID uuid.UUID, from, to time.Time) (Summary, error) {
	var out Summary

	err := r.db.WithContext(ctx).Model(&Sale{}).Select("COUNT(*) AS count, COALESCE(SUM(subtotal),0) AS subtotal, COALESCE(SUM(tax_amount),0) AS tax_amount, COALESCE(SUM(total),0) AS total").Where("business_id = ? AND sold_at >= ? AND sold_at < ? AND status <> 'void'", businessID, from, to).Scan(&out).Error

	return out, err
}

func (r *Repository) Breakdown(ctx context.Context, businessID uuid.UUID, field string) ([]Breakdown, error) {
	var out []Breakdown

	err := r.db.WithContext(ctx).Model(&Sale{}).Select(field+" AS key, COALESCE(SUM(total),0) AS total, COUNT(*) AS count").Where("business_id = ? AND status <> 'void'", businessID).Group(field).Scan(&out).Error

	return out, err
}

func (r *Repository) ProductBreakdown(ctx context.Context, businessID uuid.UUID) ([]Breakdown, error) {
	var out []Breakdown

	err := r.db.WithContext(ctx).Model(&SaleLine{}).Select("product_id::text AS key, COALESCE(SUM(line_total),0) AS total, COUNT(*) AS count").Where("business_id = ?", businessID).Group("product_id").Scan(&out).Error

	return out, err
}
