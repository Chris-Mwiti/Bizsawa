package orders

import (
	sharedhttp "github.com/Codecx-Org/FinAI/backend/internal/shared/http"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/middleware"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/pagination"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"net/http"
)

type Handler struct{ svc *Service }

func (h Handler) List(w http.ResponseWriter, r *http.Request) {
	bid, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}
	items, err := h.svc.List(r.Context(), bid, pagination.FromRequest(r))
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"orders": items})
}
func (h Handler) Create(w http.ResponseWriter, r *http.Request) {
	bid, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}
	var req CreateOrderRequest
	if err := sharedhttp.Decode(r, &req); err != nil {
		sharedhttp.Error(w, err)
		return
	}
	order, err := h.svc.Create(r.Context(), bid, req)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusCreated, order)
}
func (h Handler) Get(w http.ResponseWriter, r *http.Request) {
	bid, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	order, err := h.svc.Get(r.Context(), bid, id)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, order)
}
func (h Handler) Confirm(w http.ResponseWriter, r *http.Request) {
	bid, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	order, err := h.svc.Confirm(r.Context(), bid, id)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, order)
}
func (h Handler) Fulfill(w http.ResponseWriter, r *http.Request) {
	bid, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}
	uid, ok := middleware.UserIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errUnauthorized())
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	order, err := h.svc.Fulfill(r.Context(), bid, uid, id)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, order)
}
func (h Handler) Cancel(w http.ResponseWriter, r *http.Request) {
	bid, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	if err := h.svc.Cancel(r.Context(), bid, id); err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"status": "cancelled"})
}
func (h Handler) Refund(w http.ResponseWriter, r *http.Request) {
	bid, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	if err := h.svc.Refund(r.Context(), bid, id); err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"status": "refunded"})
}
