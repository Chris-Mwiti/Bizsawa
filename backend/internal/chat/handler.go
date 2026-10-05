package chat

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/google/uuid"

	"github.com/Codecx-Org/FinAI/backend/internal/mcp"
	apperrors "github.com/Codecx-Org/FinAI/backend/internal/shared/errors"
	sharedhttp "github.com/Codecx-Org/FinAI/backend/internal/shared/http"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/middleware"
)

type Handler struct {
	svc      *Service
	registry *mcp.Registry
}

func NewHandler(svc *Service, registry *mcp.Registry) *Handler {
	return &Handler{svc: svc, registry: registry}
}

type ChatHTTPRequest struct {
	Message  string        `json:"message"`
	History  []ChatMessage `json:"history"`
	Language string        `json:"language"`
}

// Chat handles POST /api/v1/chatbot/chat and POST /api/v1/chat/business-owner
// Auth + BusinessID required (like other handlers). Supports mobile useChat hook.
func (h *Handler) Chat(w http.ResponseWriter, r *http.Request) {
	uid, ok := middleware.UserIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, apperrors.ErrUnauthorized.WithMessage("unauthorized — missing user"))
		return
	}

	bid, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok || bid == uuid.Nil {
		sharedhttp.Error(w, apperrors.ErrForbidden.WithMessage("business context is required — select a business (X-Business-ID)"))
		return
	}
	// role resolution — if registry has enforcer, let it gate per tool; here we just need session for tool calls
	// Try to get role from header? fallback OWNER for business owner chat
	role := r.Header.Get("X-Role")
	if role == "" {
		role = "OWNER"
	}
	// Business owner profile
	session := mcp.Session{
		UserID:     uid,
		BusinessID: bid,
		Role:       role,
		Profile:    mcp.ProfileBusinessOwner,
		RequestID:  r.Header.Get("X-Request-ID"),
	}
	// TenantID mirrors BusinessID (TenantResolution does this)
	if tid, ok := middleware.TenantIDFromCtx(r.Context()); ok {
		session.TenantID = tid
	} else {
		session.TenantID = bid
	}

	var req ChatHTTPRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sharedhttp.Error(w, apperrors.ErrUnprocessable.WithMessage("invalid JSON"))
		return
	}
	// normalize language
	if req.Language != "sw" {
		req.Language = "en"
	}

	preview := req.Message
	if len(preview) > 80 {
		preview = preview[:80] + "…"
	}

	slog.InfoContext(r.Context(), "chat request",
		"business", bid.String(), "lang", req.Language,
		"msgLen", len(req.Message), "msg", preview)

	resp, err := h.svc.Chat(r.Context(), session, ChatRequest(req))
	if err != nil {
		slog.WarnContext(r.Context(), "chat failed", "business", bid.String(), "err", err.Error())
		sharedhttp.Error(w, err)

		return
	}

	slog.InfoContext(r.Context(), "chat answered",
		"business", bid.String(), "replyLen", len(resp.Response))
	sharedhttp.JSON(w, http.StatusOK, resp)
}
