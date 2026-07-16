package auth

import apperrors "github.com/Codecx-Org/FinAI/backend/internal/shared/errors"

var (
	ErrUnauthorized = apperrors.ErrUnauthorized.WithMessage("invalid credentials")
	ErrEmailTaken   = apperrors.ErrConflict.WithMessage("email is already registered")
	ErrInactiveUser = apperrors.ErrForbidden.WithMessage("user account is inactive")
)
