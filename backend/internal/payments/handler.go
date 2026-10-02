package payments

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	sharedhttp "github.com/Codecx-Org/FinAI/backend/internal/shared/http"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/middleware"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/models"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/pagination"
)

type Handler struct{ svc *Service }

func (h Handler) Initiate(w http.ResponseWriter, r *http.Request) {
	bid, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}

	var req models.InitiateRequest
	if err := sharedhttp.Decode(r, &req); err != nil {
		sharedhttp.Error(w, err)
		return
	}

	cmd, err := h.svc.Initiate(r.Context(), bid, req)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}

	sharedhttp.JSON(w, http.StatusAccepted, cmd)
}

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

	sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"payments": items})
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

	cmd, err := h.svc.Get(r.Context(), bid, id)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}

	sharedhttp.JSON(w, http.StatusOK, cmd)
}

// Cancel marks a pending/processing payment as failed so the app can stop
// polling, notify the user, and allow a retry. Terminal payments are returned
// untouched (idempotent).
func (h Handler) Cancel(w http.ResponseWriter, r *http.Request) {
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

	cmd, err := h.svc.Cancel(r.Context(), bid, id)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}

	sharedhttp.JSON(w, http.StatusOK, cmd)
}

// Check re-queries Daraja for a processing payment's outcome (STK query).
// Daraja still answers async via callback; this confirms the query was
// accepted so the app can keep polling instead of hanging.
func (h Handler) Check(w http.ResponseWriter, r *http.Request) {
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

	result, err := h.svc.CheckSTK(r.Context(), bid, id)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}

	sharedhttp.JSON(w, http.StatusAccepted, result)
}

type registerC2BRequest struct {
	ResponseType string `json:"responseType"`
}

type transactionStatusRequest struct {
	TransactionID string `json:"transactionId"`
	Remarks       string `json:"remarks"`
	Occasion      string `json:"occasion"`
}

func (h Handler) RegisterC2BURLs(w http.ResponseWriter, r *http.Request) {
	var req registerC2BRequest
	if err := sharedhttp.Decode(r, &req); err != nil {
		sharedhttp.Error(w, err)
		return
	}

	result, err := h.svc.RegisterMpesaC2BURLs(r.Context(), req.ResponseType)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}

	sharedhttp.JSON(w, http.StatusAccepted, result)
}

func (h Handler) QueryTransactionStatus(w http.ResponseWriter, r *http.Request) {
	var req transactionStatusRequest
	if err := sharedhttp.Decode(r, &req); err != nil {
		sharedhttp.Error(w, err)
		return
	}

	result, err := h.svc.QueryMpesaTransactionStatus(r.Context(), TransactionStatusRequest(req))
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}

	sharedhttp.JSON(w, http.StatusAccepted, result)
}

func (h Handler) MpesaCallback(w http.ResponseWriter, r *http.Request) {
	var raw json.RawMessage
	if err := sharedhttp.Decode(r, &raw); err != nil {
		sharedhttp.Error(w, err)
		return
	}

	if err := h.svc.HandleMpesaCallback(r.Context(), raw); err != nil {
		sharedhttp.Error(w, err)
		return
	}

	sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"ResultCode": 0, "ResultDesc": "Accepted"})
}

func (h Handler) MpesaValidation(w http.ResponseWriter, r *http.Request) {
	sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"ResultCode": 0, "ResultDesc": "Accepted"})
}
