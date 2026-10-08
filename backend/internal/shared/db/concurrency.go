package db

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Advisory lock namespaces (second key of the (int,int) variant) so sales and
// invoice numbering serialise independently per business.
const (
	AdvisoryKeySales   = 11
	AdvisoryKeyInvoice = 12
)

// LockBusinessSequence serialises per-business document-number generation
// within the current transaction. Must be called inside a tx; the lock is
// released automatically at commit/rollback (pg_advisory_xact_lock).
// Uses the (int,int) variant: hashtext(business_id) + namespace key.
func LockBusinessSequence(ctx context.Context, tx *gorm.DB, businessID uuid.UUID, namespace int) error {
	return tx.WithContext(ctx).Exec(
		`SELECT pg_advisory_xact_lock(hashtext(?::text), ?)`,
		businessID.String(), namespace,
	).Error
}

// IsDuplicateKey reports unique-violation errors (SQLSTATE 23505) across
// drivers: pgconn.PgError, gorm.ErrDuplicatedKey, or message match.
func IsDuplicateKey(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, gorm.ErrDuplicatedKey) {
		return true
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "23505") ||
		strings.Contains(msg, "duplicate key") ||
		strings.Contains(msg, "unique constraint") ||
		strings.Contains(msg, "duplicated key")
}
