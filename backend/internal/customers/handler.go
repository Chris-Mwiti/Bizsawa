package customers

import (
	"net/http"

	sharedhttp "github.com/Codecx-Org/FinAI/backend/internal/shared/http"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/middleware"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/pagination"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type Handler struct{ svc *Service }

func (h Handler) List(w http.ResponseWriter, r *http.Request) {
	businessID, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}
	items, err := h.svc.List(r.Context(), businessID, pagination.FromRequest(r))
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"customers": items})
}

func (h Handler) Create(w http.ResponseWriter, r *http.Request) {
	businessID, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}
	var req CustomerRequest
	if err := sharedhttp.Decode(r, &req); err != nil {
		sharedhttp.Error(w, err)
		return
	}
	customer, err := h.svc.Create(r.Context(), businessID, req)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusCreated, customer)
}

func (h Handler) Get(w http.ResponseWriter, r *http.Request) {
	businessID, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}
	customerID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	customer, err := h.svc.Get(r.Context(), businessID, customerID)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, customer)
}

func (h Handler) Update(w http.ResponseWriter, r *http.Request) {
	businessID, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}
	customerID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	var req CustomerRequest
	if err := sharedhttp.Decode(r, &req); err != nil {
		sharedhttp.Error(w, err)
		return
	}
	customer, err := h.svc.Update(r.Context(), businessID, customerID, req)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, customer)
}

func (h Handler) Delete(w http.ResponseWriter, r *http.Request) {
	businessID, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}
	customerID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	if err := h.svc.Delete(r.Context(), businessID, customerID); err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"status": "deleted"})
}

func (h Handler) TopCustomers(w http.ResponseWriter, r *http.Request) {
	businessID, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}
	items, err := h.svc.GetTopCustomers(r.Context(), businessID, 10)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"customers": items})
}

func (h Handler) PurchaseHistory(w http.ResponseWriter, r *http.Request) {
	businessID, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}
	customerID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	items, err := h.svc.GetCustomerPurchaseHistory(r.Context(), businessID, customerID)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"history": items})
}
