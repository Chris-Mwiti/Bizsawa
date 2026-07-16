package tenancy

import apperrors "github.com/Codecx-Org/FinAI/backend/internal/shared/errors"

func apperrUnauthorized() error {
	return apperrors.ErrUnauthorized.WithMessage("authentication required")
}
