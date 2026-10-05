package users

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"

	apperrors "github.com/Codecx-Org/FinAI/backend/internal/shared/errors"
	sharedhttp "github.com/Codecx-Org/FinAI/backend/internal/shared/http"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/middleware"
)

type Handler struct {
	svc       *Service
	inviteSvc *InviteService
	repo      *Repository
	db        *gorm.DB
}

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

	profile, err := h.svc.CreateProfile(r.Context(), businessId, userId, req)
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

func (h Handler) InviteByEmail(w http.ResponseWriter, r *http.Request) {
	if h.inviteSvc == nil {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}

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
	// Role gate: OWNER can invite any, MANAGER only CASHIER
	inviterMember, err := h.repo.FindActiveByBusinessAndUser(r.Context(), businessID, userID)
	if err != nil {
		sharedhttp.Error(w, errUnauthorized())
		return
	}

	var req InviteByEmailRequest
	if err := sharedhttp.Decode(r, &req); err != nil {
		sharedhttp.Error(w, err)
		return
	}

	req.Role = strings.ToUpper(strings.TrimSpace(req.Role))
	if inviterMember.Role == "MANAGER" && req.Role != "CASHIER" {
		sharedhttp.Error(w, errForbiddenRole())
		return
	}

	if inviterMember.Role != "OWNER" && inviterMember.Role != "MANAGER" {
		sharedhttp.Error(w, errForbiddenRole())
		return
	}

	invite, err := h.inviteSvc.InviteByEmail(r.Context(), businessID, userID, req)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}

	sharedhttp.JSON(w, http.StatusCreated, invite)
}

func (h Handler) ListInvites(w http.ResponseWriter, r *http.Request) {
	if h.inviteSvc == nil {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}

	businessID, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}

	invites, err := h.inviteSvc.ListInvites(r.Context(), businessID)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}

	sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"invites": invites})
}

func (h Handler) AcceptInvite(w http.ResponseWriter, r *http.Request) {
	if h.inviteSvc == nil {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}

	businessID, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}

	var req struct {
		Email string `json:"email"`
		Otp   string `json:"otp"`
		Name  string `json:"name"`
	}

	if err := sharedhttp.Decode(r, &req); err != nil {
		sharedhttp.Error(w, err)
		return
	}

	invite, userID, role, err := h.inviteSvc.AcceptInvite(r.Context(), AcceptInviteRequest{BusinessID: businessID, Email: req.Email, Otp: req.Otp, Name: req.Name})
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}

	sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"status": "accepted", "invite": invite, "userId": userID, "role": role})
}

func (h Handler) AcceptInvitePublic(w http.ResponseWriter, r *http.Request) {
	if h.inviteSvc == nil {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}

	var req AcceptInviteRequest
	if err := sharedhttp.Decode(r, &req); err != nil {
		sharedhttp.Error(w, err)
		return
	}

	invite, userID, role, err := h.inviteSvc.AcceptInvite(r.Context(), req)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	// Try to issue auth tokens for immediate login if inviteSvc has token issuer configured.
	// If not configured, just return accepted status and let client sign-in via OTP.
	if h.inviteSvc != nil {
		// Best-effort: if invite service can issue tokens, it would have done so; here we just return member info.
		// Tokens will be obtained via normal /auth/sign-in/email-otp using same OTP if we also created auth_otps (see InviteByEmail).
		// For direct login, front-end can call /auth/sign-in/email-otp with same email/otp after this.
	}

	sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"status": "accepted", "invite": invite, "userId": userID, "role": role, "businessId": req.BusinessID})
}

func errForbiddenRole() error {
	return apperrors.ErrForbidden.WithMessage("forbidden: insufficient role to invite for that role (owner can invite any, manager only cashier)")
}

func (h Handler) GetProfile(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errUnauthorized())
		return
	}

	businessId, _ := middleware.BusinessIDFromCtx(r.Context())
	if businessId == uuid.Nil {
		// profile is per-user, not strictly per-business — allow without business context
		businessId = userID
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

	businessId, _ := middleware.BusinessIDFromCtx(r.Context())
	if businessId == uuid.Nil {
		businessId = userID
	}

	var req UpdateProfileRequest
	if err := sharedhttp.Decode(r, &req); err != nil {
		sharedhttp.Error(w, err)
		return
	}

	profile, err := h.svc.UpdateProfile(r.Context(), userID, businessId, req)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}

	sharedhttp.JSON(w, http.StatusOK, profile)
}
