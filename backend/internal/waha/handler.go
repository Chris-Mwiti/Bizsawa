package waha

import (
	"net/http"

	sharedhttp "github.com/Codecx-Org/FinAI/backend/internal/shared/http"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/middleware"
)

type Handler struct{ svc *Service }

// Send handles a direct text message send for the current business.
func (h Handler) Send(w http.ResponseWriter, r *http.Request) {
	if _, ok := middleware.BusinessIDFromCtx(r.Context()); !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}
	var req SendRequest
	if err := sharedhttp.Decode(r, &req); err != nil {
		sharedhttp.Error(w, err)
		return
	}
	resp, err := h.svc.Send(r.Context(), req.Phone, req.Message)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, resp)
}

// notificationRequest is a typed notification dispatch.
type notificationRequest struct {
	Type  string         `json:"type"`
	Phone string         `json:"phone"`
	Data  map[string]any `json:"data"`
}

// Notify dispatches a typed notification using a message template.
func (h Handler) Notify(w http.ResponseWriter, r *http.Request) {
	if _, ok := middleware.BusinessIDFromCtx(r.Context()); !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}
	var req notificationRequest
	if err := sharedhttp.Decode(r, &req); err != nil {
		sharedhttp.Error(w, err)
		return
	}
	resp, err := h.svc.SendNotification(r.Context(), req.Phone, req.Type, req.Data)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, resp)
}