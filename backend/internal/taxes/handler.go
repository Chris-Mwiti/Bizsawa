package taxes

import (
	sharedhttp "github.com/Codecx-Org/FinAI/backend/internal/shared/http"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/middleware"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/pagination"
	"github.com/go-chi/chi/v5"
	"net/http"
	"time"
)

type Handler struct{ svc *Service }

func (h Handler) ListRules(w http.ResponseWriter, r *http.Request) {
	bid, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}
	items, err := h.svc.ListRules(r.Context(), bid, pagination.FromRequest(r))
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"taxRules": items})
}

func (h Handler) CreateRule(w http.ResponseWriter, r *http.Request) {
	bid, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}
	var req RuleRequest
	if err := sharedhttp.Decode(r, &req); err != nil {
		sharedhttp.Error(w, err)
		return
	}
	item, err := h.svc.CreateRule(r.Context(), bid, req)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusCreated, item)
}

func (h Handler) EnsureVAT(w http.ResponseWriter, r *http.Request) {
	bid, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}
	item, err := h.svc.EnsureKenyaVAT(r.Context(), bid)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, item)
}

func (h Handler) Summary(w http.ResponseWriter, r *http.Request) {
	bid, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}
	from := parseTime(r.URL.Query().Get("from"), time.Now().AddDate(0, -1, 0))
	to := parseTime(r.URL.Query().Get("to"), time.Now().AddDate(0, 0, 1))
	items, err := h.svc.Summary(r.Context(), bid, from, to)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"summary": items})
}

func parseTime(v string, fallback time.Time) time.Time {
	if v == "" {
		return fallback
	}
	t, err := time.Parse(time.RFC3339, v)
	if err != nil {
		return fallback
	}
	return t
}

var _ = chi.URLParam
