package invoices

import apperrors "github.com/Codecx-Org/FinAI/backend/internal/shared/errors"

func errBusinessRequired() error {
	return apperrors.ErrForbidden.WithMessage("business context is required")
}
