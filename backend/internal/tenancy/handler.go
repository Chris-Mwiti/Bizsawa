package tenancy

import (
	"net/http"

	sharedhttp "github.com/Codecx-Org/FinAI/backend/internal/shared/http"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/middleware"
)

type Handler struct{ svc *Service }

func (h Handler) GetActiveSubscription(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, apperrUnauthorized())
		return
	}
	sub, err := h.svc.EnsureDefaultSubscription(r.Context(), userID)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, sub)
}
