package sync

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	apperrors "github.com/Codecx-Org/FinAI/backend/internal/shared/errors"
	sharedhttp "github.com/Codecx-Org/FinAI/backend/internal/shared/http"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/middleware"
)

type Handler struct{ svc *Service }

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// GET /sync/pull?since=<cursor>&limit=<per-table cap> — cursor is lastPulledAt ms (Watermelon) or RFC3339.
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
	// Capped per-table rows (F5): full pulls at ~20k rows already take
	// 1.2–1.8s. Clients page by feeding the returned timestamp back as
	// ?since=. Clamp to [1, MaxPullLimit].
	limit := DefaultPullLimit
	if raw := r.URL.Query().Get("limit"); raw == "" {
		raw = r.URL.Query().Get("per_table")
		if raw == "" {
			raw = r.URL.Query().Get("perTable")
		}
		if raw != "" {
			if n, err := strconv.Atoi(raw); err == nil {
				limit = n
			}
		}
	} else if n, err := strconv.Atoi(raw); err == nil {
		limit = n
	}
	if limit <= 0 {
		limit = DefaultPullLimit
	}
	if limit > MaxPullLimit {
		limit = MaxPullLimit
	}
	// default epoch
	res, err := h.svc.PullWithLimit(r.Context(), bid, since, limit)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}

	sharedhttp.JSON(w, http.StatusOK, res)
}

// POST /sync/push — idempotent via X-Idempotency-Key middleware (reused).
func (h *Handler) Push(w http.ResponseWriter, r *http.Request) {
	bid, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, apperrors.ErrForbidden.WithMessage("business context required"))
		return
	}

	uid, _ := middleware.UserIDFromCtx(r.Context())

	var req PushRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sharedhttp.Error(w, err)
		return
	}

	if req.Changes == nil {
		req.Changes = map[string]TableChanges{}
	}

	res, err := h.svc.PushWithUser(r.Context(), bid, uid, req)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}

	sharedhttp.JSON(w, http.StatusOK, res)
}

// GET /sync/conflicts — list unresolved.
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

// POST /sync/conflicts/:id/resolve — body {resolution: kept_client|kept_server}.
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
