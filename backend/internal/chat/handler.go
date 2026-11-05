package chat

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"

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

func (h *Handler) sessionFromRequest(w http.ResponseWriter, r *http.Request) (mcp.Session, bool) {
	uid, ok := middleware.UserIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, apperrors.ErrUnauthorized.WithMessage("unauthorized — missing user"))
		return mcp.Session{}, false
	}

	bid, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok || bid == uuid.Nil {
		sharedhttp.Error(w, apperrors.ErrForbidden.WithMessage("business context is required — select a business (X-Business-ID)"))
		return mcp.Session{}, false
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

	return session, true
}

// Chat handles POST /api/v1/chatbot/chat and POST /api/v1/chat/business-owner
// Auth + BusinessID required (like other handlers). Supports mobile useChat hook.
func (h *Handler) Chat(w http.ResponseWriter, r *http.Request) {
	session, ok := h.sessionFromRequest(w, r)
	if !ok {
		return
	}
	bid := session.BusinessID

	var req ChatHTTPRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sharedhttp.Error(w, apperrors.ErrUnprocessable.WithMessage("invalid JSON"))
		return
	}
	// normalize language
	if req.Language != "sw" {
		req.Language = "en"
	}
	if strings.TrimSpace(req.Message) == "" {
		sharedhttp.Error(w, apperrors.ErrBadRequest.WithMessage("message must be non-empty"))
		return
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

// Stream handles POST /api/v1/chat/stream. It speaks the AG-UI protocol over
// newline-delimited JSON, which is what TanStack AI's xhrHttpStream adapter
// consumes. The response starts as soon as the run starts so tool activity is
// visible while the LLM is still generating.
func (h *Handler) Stream(w http.ResponseWriter, r *http.Request) {
	session, ok := h.sessionFromRequest(w, r)
	if !ok {
		return
	}

	var req StreamRequest
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 2<<20))
	if err := decoder.Decode(&req); err != nil {
		sharedhttp.Error(w, apperrors.ErrUnprocessable.WithMessage("invalid JSON"))
		return
	}

	if strings.TrimSpace(req.messageText()) == "" {
		sharedhttp.Error(w, apperrors.ErrBadRequest.WithMessage("message must be non-empty"))
		return
	}

	bid := session.BusinessID
	slog.InfoContext(r.Context(), "chat stream request",
		"business", bid.String(), "thread", req.ThreadID, "run", req.RunID,
		"messages", len(req.Messages), "lang", req.language())

	wroteHeader := false
	flusher, _ := w.(http.Flusher)
	encoder := json.NewEncoder(w)

	emit := func(event StreamEvent) error {
		if !wroteHeader {
			w.Header().Set("Content-Type", "application/x-ndjson; charset=utf-8")
			w.Header().Set("Cache-Control", "no-cache")
			w.Header().Set("X-Accel-Buffering", "no")
			w.WriteHeader(http.StatusOK)
			wroteHeader = true
		}

		if err := encoder.Encode(event); err != nil {
			return err
		}
		if flusher != nil {
			flusher.Flush()
		}

		return nil
	}

	if err := h.svc.StreamChat(r.Context(), session, req, emit); err != nil {
		if !wroteHeader {
			sharedhttp.Error(w, err)
			return
		}

		slog.WarnContext(r.Context(), "chat stream failed after headers",
			"business", bid.String(), "err", err.Error())
	}

	slog.InfoContext(r.Context(), "chat stream finished", "business", bid.String())
}
