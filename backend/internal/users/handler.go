package users

import (
	"net/http"

	sharedhttp "github.com/Codecx-Org/FinAI/backend/internal/shared/http"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/middleware"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type Handler struct{ svc *Service }

func (h Handler) ListMembers(w http.ResponseWriter, r *http.Request) {
	businessID, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}
	members, err := h.svc.ListMembers(r.Context(), businessID)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"members": members})
}

func (h Handler) CreateProfile(w http.ResponseWriter, r *http.Request) {
	userId, ok := middleware.UserIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}

	businessId, ok := middleware.BusinessIDFromCtx(r.Context())

	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}

	var req CreateProfileRequest
	
	if err := sharedhttp.Decode(r, &req); err != nil {
		sharedhttp.Error(w, err)
		return
	}

	profile, err := h.svc.CreateProfile(r.Context(), businessId, userId,req) 

	if err != nil {
		sharedhttp.Error(w, err)
		return
	}

	sharedhttp.JSON(w, http.StatusCreated, profile)
}

func (h Handler) InviteMember(w http.ResponseWriter, r *http.Request) {
	businessID, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}
	userID, ok := middleware.UserIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errUnauthorized())
		return
	}
	var req InviteMemberRequest
	if err := sharedhttp.Decode(r, &req); err != nil {
		sharedhttp.Error(w, err)
		return
	}
	member, err := h.svc.InviteMember(r.Context(), businessID, userID, req)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusCreated, member)
}

func (h Handler) UpdateRole(w http.ResponseWriter, r *http.Request) {
	businessID, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}
	memberID, err := uuid.Parse(chi.URLParam(r, "memberID"))
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	var req UpdateRoleRequest
	if err := sharedhttp.Decode(r, &req); err != nil {
		sharedhttp.Error(w, err)
		return
	}
	if err := h.svc.UpdateRole(r.Context(), businessID, memberID, req.Role); err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"status": "updated"})
}

func (h Handler) DeactivateMember(w http.ResponseWriter, r *http.Request) {
	businessID, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}
	memberID, err := uuid.Parse(chi.URLParam(r, "memberID"))
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	if err := h.svc.Deactivate(r.Context(), businessID, memberID); err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"status": "deactivated"})
}

func (h Handler) GetProfile(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errUnauthorized())
		return
	}

	businessId, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errUnauthorized())
		return
	}

	profile, err := h.svc.GetOrCreateProfile(r.Context(), userID, businessId)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, profile)
}

func (h Handler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errUnauthorized())
		return
	}

	businessId, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errUnauthorized())
		return
	}

	var req UpdateProfileRequest
	if err := sharedhttp.Decode(r, &req); err != nil {
		sharedhttp.Error(w, err)
		return
	}
	profile, err := h.svc.UpdateProfile(r.Context(), userID, businessId,req)

	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, profile)
}
