package business

import apperrors "github.com/Codecx-Org/FinAI/backend/internal/shared/errors"

func errUnauthorized() error { return apperrors.ErrUnauthorized.WithMessage("authentication required") }
