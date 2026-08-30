package analytics

import (
	"net/http"

	sharedhttp "github.com/Codecx-Org/FinAI/backend/internal/shared/http"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/middleware"
	"github.com/google/uuid"
)

type Handler struct {
	svc    *Service
	enqueue func(businessID uuid.UUID, tf Timeframe) error
}

// Get returns the snapshot for the requested timeframe, computing it
// synchronously if nothing has been pre-computed yet.
func (h Handler) Get(w http.ResponseWriter, r *http.Request) {
	bid, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}
	tf := Timeframe(r.URL.Query().Get("timeframe"))
	if !tf.Valid() {
		tf = TimeframeMonth
	}
	snap, err := h.svc.Get(r.Context(), bid, tf)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, snap)
}

// Refresh enqueues a background recomputation job and returns 202.
func (h Handler) Refresh(w http.ResponseWriter, r *http.Request) {
	bid, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}
	tf := Timeframe(r.URL.Query().Get("timeframe"))
	if !tf.Valid() {
		tf = TimeframeMonth
	}
	if h.enqueue != nil {
		if err := h.enqueue(bid, tf); err != nil {
			sharedhttp.Error(w, err)
			return
		}
	}
	sharedhttp.JSON(w, http.StatusAccepted, sharedhttp.Envelope{"status": "refresh_queued", "timeframe": string(tf)})
}