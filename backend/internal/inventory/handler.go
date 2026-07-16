package inventory

import (
	sharedhttp "github.com/Codecx-Org/FinAI/backend/internal/shared/http"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/middleware"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/pagination"
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
	sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"inventory": items})
}
func (h Handler) Adjust(w http.ResponseWriter, r *http.Request) {
	bid, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}
	var req AdjustmentRequest
	if err := sharedhttp.Decode(r, &req); err != nil {
		sharedhttp.Error(w, err)
		return
	}
	mv, err := h.svc.Adjust(r.Context(), bid, req)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusCreated, mv)
}
func (h Handler) LowStock(w http.ResponseWriter, r *http.Request) {
	bid, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}
	items, err := h.svc.GetLowStockItems(r.Context(), bid)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"items": items})
}
func (h Handler) Movements(w http.ResponseWriter, r *http.Request) {
	bid, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}
	items, err := h.svc.GetStockMovements(r.Context(), bid, pagination.FromRequest(r))
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"movements": items})
}
func (h Handler) Valuation(w http.ResponseWriter, r *http.Request) {
	bid, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}
	items, err := h.svc.GetInventoryValuation(r.Context(), bid)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"valuation": items})
}
