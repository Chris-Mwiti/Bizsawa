package authz

import apperrors "github.com/Codecx-Org/FinAI/backend/internal/shared/errors"

func ErrForbidden() error {
	return apperrors.ErrForbidden.WithMessage("forbidden")
}

func ErrBusinessRequired() error {
	return apperrors.ErrForbidden.WithMessage("business context is required")
}
