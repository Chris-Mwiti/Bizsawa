package tenancy

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

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

func (h Handler) InitiateUpgrade(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, apperrUnauthorized())
		return
	}

	var req InitiateUpgradeRequest
	if err := sharedhttp.Decode(r, &req); err != nil {
		sharedhttp.Error(w, err)
		return
	}

	key, _ := middleware.IdempotencyKeyFromCtx(r.Context())
	if key == "" {
		key = uuid.NewString()
	}

	p, err := h.svc.InitiateUpgrade(r.Context(), userID, req, key)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	// If tenancy has mpesa provider attached, trigger STK push async — caller polls status.
	// Actual STK is triggered via TenancyModule's mpesa hook (see UpgradeWithSTK).
	if h.svc != nil {
		// try async STK if configured via handler's extended service
		go func() {
			_ = h.svc.TriggerSTKIfConfigured(r.Context(), p.ID)
		}()
	}

	sharedhttp.JSON(w, http.StatusAccepted, p)
}

func (h Handler) GetSubscriptionPayment(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, apperrUnauthorized())
		return
	}

	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}

	p, err := h.svc.GetSubscriptionPayment(r.Context(), id, userID)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}

	sharedhttp.JSON(w, http.StatusOK, p)
}

func (h Handler) SubscriptionCallback(w http.ResponseWriter, r *http.Request) {
	var raw json.RawMessage
	if err := sharedhttp.Decode(r, &raw); err != nil {
		sharedhttp.Error(w, err)
		return
	}

	if err := h.svc.HandleSubscriptionCallback(r.Context(), raw); err != nil {
		sharedhttp.Error(w, err)
		return
	}

	sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"ResultCode": 0, "ResultDesc": "Accepted"})
}
