package analytics

import apperrors "github.com/Codecx-Org/FinAI/backend/internal/shared/errors"

func errBusinessRequired() error {
	return apperrors.ErrForbidden.WithMessage("business context is required")
}

func errInvalidTimeframe() error {
	return apperrors.ErrUnprocessable.WithMessage("invalid timeframe; expected one of day, week, month, year")
}
