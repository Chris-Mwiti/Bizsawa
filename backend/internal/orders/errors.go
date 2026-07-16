package orders

import apperrors "github.com/Codecx-Org/FinAI/backend/internal/shared/errors"

func errBusinessRequired() error {
	return apperrors.ErrForbidden.WithMessage("business context is required")
}
func errUnauthorized() error { return apperrors.ErrUnauthorized.WithMessage("authentication required") }
