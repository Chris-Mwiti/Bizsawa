package products

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
	sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"products": items})
}

func (h Handler) Create(w http.ResponseWriter, r *http.Request) {
	businessID, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}
	var req ProductRequest
	if err := sharedhttp.Decode(r, &req); err != nil {
		sharedhttp.Error(w, err)
		return
	}
	product, err := h.svc.Create(r.Context(), businessID, req)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusCreated, product)
}

func (h Handler) Get(w http.ResponseWriter, r *http.Request) {
	businessID, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}
	productID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	product, err := h.svc.Get(r.Context(), businessID, productID)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, product)
}

func (h Handler) GetVariant(w http.ResponseWriter, r *http.Request) {
	businessId, ok := middleware.BusinessIDFromCtx(r.Context())

	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}

	productID, err := uuid.Parse(chi.URLParam(r, "id"))

	if err != nil{
		sharedhttp.Error(w, err)
		return
	}
	product, err := h.svc.FindProductVariant(r.Context(), businessId,productID)
	
	if err != nil {
   sharedhttp.Error(w, err)
	 return
	}

	sharedhttp.JSON(w, http.StatusOK, product)
}

func (h Handler) Update(w http.ResponseWriter, r *http.Request) {
	businessID, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}
	productID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	var req ProductRequest
	if err := sharedhttp.Decode(r, &req); err != nil {
		sharedhttp.Error(w, err)
		return
	}
	product, err := h.svc.Update(r.Context(), businessID, productID, req)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, product)
}

func (h Handler) Delete(w http.ResponseWriter, r *http.Request) {
	businessID, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}
	productID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	if err := h.svc.Delete(r.Context(), businessID, productID); err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"status": "deleted"})
}

func (h Handler) GenerateDescription(w http.ResponseWriter, r *http.Request) {
	businessID, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}
	productID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	description, err := h.svc.GenerateDescription(r.Context(), businessID, productID)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"description": description})
}
