package payments

import apperrors "github.com/Codecx-Org/FinAI/backend/internal/shared/errors"

func errBusinessRequired() error {
	return apperrors.ErrForbidden.WithMessage("business context is required")
}
func errIdempotencyRequired() error {
	return apperrors.ErrUnprocessable.WithMessage("X-Idempotency-Key is required")
}
