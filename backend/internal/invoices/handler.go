package invoices

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	sharedhttp "github.com/Codecx-Org/FinAI/backend/internal/shared/http"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/middleware"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/pagination"
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

	sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"invoices": items})
}

func (h Handler) Create(w http.ResponseWriter, r *http.Request) {
	bid, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}

	var req CreateInvoiceRequest
	if err := sharedhttp.Decode(r, &req); err != nil {
		sharedhttp.Error(w, err)
		return
	}

	inv, err := h.svc.CreateInvoice(r.Context(), bid, req)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}

	sharedhttp.JSON(w, http.StatusCreated, inv)
}

func (h Handler) Get(w http.ResponseWriter, r *http.Request) {
	bid, id, ok := ids(w, r)
	if !ok {
		return
	}

	inv, err := h.svc.Get(r.Context(), bid, id)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}

	sharedhttp.JSON(w, http.StatusOK, inv)
}

func (h Handler) Send(w http.ResponseWriter, r *http.Request) {
	bid, id, ok := ids(w, r)
	if !ok {
		return
	}

	inv, err := h.svc.Send(r.Context(), bid, id, "email")
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}

	sharedhttp.JSON(w, http.StatusOK, inv)
}

func (h Handler) SendWhatsApp(w http.ResponseWriter, r *http.Request) {
	bid, id, ok := ids(w, r)
	if !ok {
		return
	}

	inv, err := h.svc.Send(r.Context(), bid, id, "whatsapp")
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}

	sharedhttp.JSON(w, http.StatusOK, inv)
}

func (h Handler) RecordPayment(w http.ResponseWriter, r *http.Request) {
	bid, id, ok := ids(w, r)
	if !ok {
		return
	}

	var req RecordPaymentRequest
	if err := sharedhttp.Decode(r, &req); err != nil {
		sharedhttp.Error(w, err)
		return
	}

	err := h.svc.RecordPayment(r.Context(), bid, id, req)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}

	sharedhttp.JSON(w, http.StatusOK, "invoice payment done")
}

func (h Handler) SettleCustomer(w http.ResponseWriter, r *http.Request) {
	bid, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}

	customerID, err := uuid.Parse(chi.URLParam(r, "customerId"))
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}

	var req RecordPaymentRequest
	if err := sharedhttp.Decode(r, &req); err != nil {
		sharedhttp.Error(w, err)
		return
	}
	// Allow frontend to send {amount: "100", method: "cash", reference: "..."} — map to RecordPaymentRequest
	// If paymentId not provided, generate one
	if req.PaymentID == uuid.Nil {
		req.PaymentID = uuid.New()
	}

	result, err := h.svc.SettleCustomerPayment(r.Context(), bid, customerID, req)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}

	sharedhttp.JSON(w, http.StatusOK, result)
}

func (h Handler) PDF(w http.ResponseWriter, r *http.Request) {
	bid, id, ok := ids(w, r)
	if !ok {
		return
	}

	pdf, err := h.svc.PDF(r.Context(), bid, id)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/pdf")
	w.WriteHeader(http.StatusOK)

	_, _ = w.Write(pdf)
}

func ids(w http.ResponseWriter, r *http.Request) (uuid.UUID, uuid.UUID, bool) {
	bid, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return uuid.Nil, uuid.Nil, false
	}

	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		sharedhttp.Error(w, err)
		return uuid.Nil, uuid.Nil, false
	}

	return bid, id, true
}
