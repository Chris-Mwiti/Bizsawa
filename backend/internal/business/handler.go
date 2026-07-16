package business

import (
	"net/http"

	sharedhttp "github.com/Codecx-Org/FinAI/backend/internal/shared/http"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/middleware"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type Handler struct{ svc *Service }

func (h Handler) CreateBusiness(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errUnauthorized())
		return
	}
	var req CreateBusinessRequest
	if err := sharedhttp.Decode(r, &req); err != nil {
		sharedhttp.Error(w, err)
		return
	}
	biz, err := h.svc.CreateBusiness(r.Context(), userID, req)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusCreated, biz)
}

func (h Handler) ListBusinesses(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errUnauthorized())
		return
	}
	items, err := h.svc.ListBusinesses(r.Context(), userID)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"businesses": items})
}

func (h Handler) GetBusiness(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errUnauthorized())
		return
	}
	businessID, err := uuid.Parse(chi.URLParam(r, "businessID"))
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	biz, err := h.svc.GetBusiness(r.Context(), businessID, userID)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, biz)
}

func (h Handler) UpdateBusiness(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errUnauthorized())
		return
	}
	businessID, err := uuid.Parse(chi.URLParam(r, "businessID"))
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	var req UpdateBusinessRequest
	if err := sharedhttp.Decode(r, &req); err != nil {
		sharedhttp.Error(w, err)
		return
	}
	biz, err := h.svc.UpdateBusiness(r.Context(), businessID, userID, req)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, biz)
}

func (h Handler) DeleteBusiness(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errUnauthorized())
		return
	}
	businessID, err := uuid.Parse(chi.URLParam(r, "businessID"))
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	if err := h.svc.DeleteBusiness(r.Context(), businessID, userID); err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"status": "deleted"})
}
