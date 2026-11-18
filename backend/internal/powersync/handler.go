package powersync

import (
	"net/http"
	"time"

	apperrors "github.com/Codecx-Org/FinAI/backend/internal/shared/errors"
	sharedhttp "github.com/Codecx-Org/FinAI/backend/internal/shared/http"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/middleware"
)

type Handler struct{ svc *TokenService }

func NewHandler(svc *TokenService) *Handler { return &Handler{svc: svc} }

// Token mints a short-lived PowerSync JWT for the authenticated user and the
// business resolved by Auth.Middleware (JWT claim) or X-Business-ID.
func (h *Handler) Token(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, apperrors.ErrUnauthorized)
		return
	}

	businessID, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, apperrors.ErrForbidden.WithMessage("business context required"))
		return
	}

	token, expires, err := h.svc.Mint(userID, businessID)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}

	sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{
		"token":         token,
		"expires_at":    expires.UTC().Format(time.RFC3339),
		"powersync_url": h.svc.URL(),
	})
}
