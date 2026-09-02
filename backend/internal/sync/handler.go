package sync

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	sharedhttp "github.com/Codecx-Org/FinAI/backend/internal/shared/http"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/middleware"
	apperrors "github.com/Codecx-Org/FinAI/backend/internal/shared/errors"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type Handler struct{ svc *Service }

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// GET /sync/pull?since=<cursor> — cursor is lastPulledAt ms (Watermelon) or RFC3339
func (h *Handler) Pull(w http.ResponseWriter, r *http.Request) {
	bid, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, apperrors.ErrForbidden.WithMessage("business context required"))
		return
	}
	sinceStr := r.URL.Query().Get("since")
	var since time.Time
	if sinceStr != "" {
		// try ms timestamp
		if ms, err := strconv.ParseInt(sinceStr, 10, 64); err == nil {
			since = time.UnixMilli(ms)
		} else if t, err := time.Parse(time.RFC3339, sinceStr); err == nil {
			since = t
		} else if t, err := time.Parse(time.RFC3339Nano, sinceStr); err == nil {
			since = t
		}
	}
	// default epoch
	res, err := h.svc.Pull(r.Context(), bid, since)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, res)
}

// POST /sync/push — idempotent via X-Idempotency-Key middleware (reused)
func (h *Handler) Push(w http.ResponseWriter, r *http.Request) {
	bid, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, apperrors.ErrForbidden.WithMessage("business context required"))
		return
	}
	var req PushRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sharedhttp.Error(w, err)
		return
	}
	if req.Changes == nil {
		req.Changes = map[string]TableChanges{}
	}
	res, err := h.svc.Push(r.Context(), bid, req)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, res)
}

// GET /sync/conflicts — list unresolved
func (h *Handler) ListConflicts(w http.ResponseWriter, r *http.Request) {
	bid, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, apperrors.ErrForbidden.WithMessage("business context required"))
		return
	}
	var conflicts []Conflict
	if err := h.svc.db.WithContext(r.Context()).Where("business_id = ? AND resolved_at IS NULL", bid).Order("created_at DESC").Find(&conflicts).Error; err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, map[string]any{"conflicts": conflicts})
}

// POST /sync/conflicts/:id/resolve — body {resolution: kept_client|kept_server}
func (h *Handler) ResolveConflict(w http.ResponseWriter, r *http.Request) {
	bid, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, apperrors.ErrForbidden.WithMessage("business context required"))
		return
	}
	idStr := chi.URLParam(r, "id")
	if idStr == "" {
		idStr = r.URL.Query().Get("id")
	}
	cid, err := uuid.Parse(idStr)
	if err != nil {
		sharedhttp.Error(w, apperrors.ErrUnprocessable.WithMessage("invalid conflict id"))
		return
	}
	var body struct {
		Resolution string `json:"resolution"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		sharedhttp.Error(w, apperrors.ErrUnprocessable.WithMessage("invalid body"))
		return
	}
	if body.Resolution != "kept_client" && body.Resolution != "kept_server" {
		sharedhttp.Error(w, apperrors.ErrUnprocessable.WithMessage("resolution must be kept_client or kept_server"))
		return
	}
	// Load conflict
	var c Conflict
	if err := h.svc.db.WithContext(r.Context()).Where("id = ? AND business_id = ?", cid, bid).First(&c).Error; err != nil {
		sharedhttp.Error(w, apperrors.ErrNotFound.WithMessage("conflict not found"))
		return
	}
	if c.ResolvedAt != nil {
		sharedhttp.Error(w, apperrors.ErrConflict.WithMessage("already resolved"))
		return
	}
	// Apply resolution
	now := time.Now()
	c.ResolvedAt = &now
	resStr := body.Resolution
	c.Resolution = &resStr
	if body.Resolution == "kept_client" {
		var payload map[string]any
		_ = json.Unmarshal(c.ClientPayload, &payload)
		if err := h.svc.ForceApplyClientPayload(r.Context(), bid, c.Table, c.RecordID, payload); err != nil {
			sharedhttp.Error(w, err)
			return
		}
	}
	h.svc.db.WithContext(r.Context()).Model(&Conflict{}).Where("id = ?", cid).Updates(map[string]any{"resolved_at": now, "resolution": body.Resolution})
	sharedhttp.JSON(w, http.StatusOK, map[string]any{"status": "resolved", "resolution": body.Resolution})
}

