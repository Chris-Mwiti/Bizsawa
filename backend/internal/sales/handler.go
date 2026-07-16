package sales

import (
	sharedhttp "github.com/Codecx-Org/FinAI/backend/internal/shared/http"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/middleware"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/pagination"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"net/http"
	"time"
)

type Handler struct{ svc *Service }

func (h Handler) List(w http.ResponseWriter, r *http.Request) {
	bid, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}
	items, err := h.svc.List(r.Context(), bid, pagination.FromRequest(r))
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"sales": items})
}

func (h Handler) Create(w http.ResponseWriter, r *http.Request) {
	bid, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}
	uid, ok := middleware.UserIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errUnauthorized())
		return
	}
	var req CreateSaleRequest
	if err := sharedhttp.Decode(r, &req); err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sale, err := h.svc.Create(r.Context(), bid, uid, req)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusCreated, sale)
}

func (h Handler) Get(w http.ResponseWriter, r *http.Request) {
	bid, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sale, err := h.svc.Get(r.Context(), bid, id)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, sale)
}

func (h Handler) Void(w http.ResponseWriter, r *http.Request) {
	bid, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	if err := h.svc.Void(r.Context(), bid, id); err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"status": "void"})
}

func (h Handler) Summary(w http.ResponseWriter, r *http.Request) {
	bid, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}
	from := parseTime(r.URL.Query().Get("from"), time.Now().AddDate(0, -1, 0))
	to := parseTime(r.URL.Query().Get("to"), time.Now().AddDate(0, 0, 1))
	sum, err := h.svc.GetSalesSummary(r.Context(), bid, from, to)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, sum)
}

func (h Handler) ByPayment(w http.ResponseWriter, r *http.Request) {
	bid, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}
	items, err := h.svc.GetSalesByPaymentMethod(r.Context(), bid)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"items": items})
}

func (h Handler) ByStaff(w http.ResponseWriter, r *http.Request) {
	bid, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}
	items, err := h.svc.GetSalesByStaff(r.Context(), bid)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"items": items})
}

func (h Handler) ByProduct(w http.ResponseWriter, r *http.Request) {
	bid, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}
	items, err := h.svc.GetSalesByProduct(r.Context(), bid)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"items": items})
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
