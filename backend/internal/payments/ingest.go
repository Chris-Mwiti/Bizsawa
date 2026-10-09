package payments

// Capture ingest path (Track 1): batch payments reported by devices
// (sms_device/manual now; pesapal/daraja later) with per-item results,
// receipt-code dedupe, merge/dispute semantics and transactional outbox
// events. Pure validation + DecideMerge (capture.go) carry the test
// coverage; this file is thin orchestration over unique constraints.

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	shareddb "github.com/Codecx-Org/FinAI/backend/internal/shared/db"
	apperrors "github.com/Codecx-Org/FinAI/backend/internal/shared/errors"
	sharedhttp "github.com/Codecx-Org/FinAI/backend/internal/shared/http"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/middleware"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/pagination"
)

const (
	// MaxIngestBatch caps POST /payments/ingest items per brief.
	MaxIngestBatch = 50
	// MaxCaptureAge bounds how far back a reported payment may lie
	// (stale/spoofed replays). Make configurable if operations need it.
	MaxCaptureAge = 90 * 24 * time.Hour
	// FutureSkew tolerates device clock drift on occurred_at.
	FutureSkew = 5 * time.Minute
)

const (
	PaymentCaptured PaymentEventType = "payment.captured"
	PaymentMerged   PaymentEventType = "payment.merged"
	PaymentDisputed PaymentEventType = "payment.disputed"
)

var receiptPattern = regexp.MustCompile(`^[A-Za-z0-9]{6,16}$`)

// IngestItem is the full set of fields the SMS/manual source may send.
// Unknown fields are rejected at decode (strict handler below).
type IngestItem struct {
	ClientEventID uuid.UUID  `json:"client_event_id"`
	MpesaReceipt  *string    `json:"mpesa_receipt"`
	AmountMinor   int64      `json:"amount_minor"`
	Currency      string     `json:"currency"`
	OccurredAt    time.Time  `json:"occurred_at"`
	ChannelType   string     `json:"channel_type"`
	Source        string     `json:"source"`
	PayerHash     *string    `json:"payer_hash"`
	ParserVersion *string    `json:"parser_version"`
	ConsentVersion *string   `json:"consent_version"`
	DeviceID      *uuid.UUID `json:"device_id"`
}

type ItemResult struct {
	ClientEventID uuid.UUID       `json:"client_event_id"`
	Result        string          `json:"result"`
	Reason        string          `json:"reason,omitempty"`
	Payment       *CapturedPayment `json:"payment,omitempty"`
}

// ValidateIngestItem is pure (table-testable): nil reason means accept.
func ValidateIngestItem(now time.Time, it IngestItem) string {
	if it.ClientEventID == uuid.Nil {
		return "client_event_id_required"
	}
	switch CaptureSource(it.Source) {
	case SourceSMSDevice, SourceManual, SourceStatement, SourcePesapal, SourceDaraja:
	default:
		return "unknown_source"
	}
	switch ChannelType(it.ChannelType) {
	case ChannelTill, ChannelPaybill, ChannelPochi, ChannelUnknown, "":
	default:
		return "unknown_channel"
	}
	if it.AmountMinor <= 0 {
		return "amount_must_be_positive"
	}
	if it.Currency != "" && (len(it.Currency) != 3) {
		return "currency_must_be_iso3"
	}
	if it.MpesaReceipt == nil || *it.MpesaReceipt == "" {
		if CaptureSource(it.Source) != SourceManual {
			return "receipt_required"
		}
	} else if !receiptPattern.MatchString(*it.MpesaReceipt) {
		return "receipt_malformed"
	}
	if it.OccurredAt.IsZero() {
		return "occurred_at_required"
	}
	if it.OccurredAt.After(now.Add(FutureSkew)) {
		return "occurred_in_future"
	}
	if now.Sub(it.OccurredAt) > MaxCaptureAge {
		return "occurred_too_old"
	}
	if it.PayerHash != nil && (len(*it.PayerHash) < 16 || len(*it.PayerHash) > 128) {
		return "payer_hash_length"
	}
	return ""
}

func (it IngestItem) toRecord(businessID uuid.UUID) CapturedPayment {
	currency := it.Currency
	if currency == "" {
		currency = "KES"
	}
	channel := ChannelType(it.ChannelType)
	if channel == "" {
		channel = ChannelUnknown
	}
	return CapturedPayment{
		BaseModel:          shareddb.BaseModel{TenantID: businessID},
		BusinessID:         businessID,
		Source:             CaptureSource(it.Source),
		VerificationStatus: statusForSource(CaptureSource(it.Source)),
		MpesaReceipt:       it.MpesaReceipt,
		AmountMinor:        it.AmountMinor,
		Currency:           currency,
		OccurredAt:         it.OccurredAt.UTC(),
		ChannelType:        channel,
		PayerHash:          it.PayerHash,
		ParserVersion:      it.ParserVersion,
		ConsentVersion:     it.ConsentVersion,
		DeviceID:           it.DeviceID,
		ClientEventID:      it.ClientEventID,
	}
}

// capturePayload is the outbox event body. Deliberately excludes payer_hash
// (privacy checklist: no hashes in logs/events).
func capturePayload(p *CapturedPayment) map[string]any {
	var receipt string
	if p.MpesaReceipt != nil {
		receipt = *p.MpesaReceipt
	}
	return map[string]any{
		"receipt":  receipt,
		"amount":   p.AmountMinor,
		"currency": p.Currency,
		"source":   string(p.Source),
		"status":   string(p.VerificationStatus),
		"channel":  string(p.ChannelType),
	}
}

// Ingest processes a batch with per-item results. Each item runs in its own
// transaction so one bad row never fails the batch; bursts are bounded by
// MaxIngestBatch at the handler.
func (s *Service) Ingest(ctx context.Context, businessID uuid.UUID, items []IngestItem) []ItemResult {
	now := time.Now().UTC()
	results := make([]ItemResult, 0, len(items))
	for _, it := range items {
		results = append(results, s.ingestOne(ctx, businessID, now, it))
	}
	return results
}

func (s *Service) ingestOne(ctx context.Context, businessID uuid.UUID, now time.Time, it IngestItem) ItemResult {
	fail := func(reason string) ItemResult {
		return ItemResult{ClientEventID: it.ClientEventID, Result: "rejected", Reason: reason}
	}
	if reason := ValidateIngestItem(now, it); reason != "" {
		return fail(reason)
	}
	if it.DeviceID != nil {
		if _, err := s.repo.FindDevice(ctx, businessID, *it.DeviceID); err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return fail("device_unknown")
			}
			s.logger.ErrorContext(ctx, "[PAYMENTS]-ingest device lookup failed", "err", err)
			return fail("internal")
		}
	}

	var out ItemResult
	err := s.repo.db.Transaction(func(tx *gorm.DB) error {
		txRepo := s.repo.WithTx(tx)
		txSvc := &Service{repo: txRepo, outbox: s.outbox, logger: s.logger, provider: s.provider}

		// Replay guard: same client event already stored.
		if existing, err := txRepo.FindCaptureByEvent(ctx, businessID, it.ClientEventID); err == nil {
			out = ItemResult{ClientEventID: it.ClientEventID, Result: "duplicate", Payment: existing}
			return nil
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}

		rec := it.toRecord(businessID)

		// Receipt match: merge or dispute.
		if rec.MpesaReceipt != nil {
			if existing, err := txRepo.FindCaptureByReceipt(ctx, businessID, *rec.MpesaReceipt); err == nil {
				return txSvc.applyMerge(ctx, tx, businessID, existing, rec, &out)
			} else if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
		}

		if err := txRepo.CreateCapture(ctx, &rec); err != nil {
			// Lost a race under burst: unique constraint fired between the
			// lookups above and the insert. Re-read and report idempotently.
			if shareddb.IsDuplicateKey(err) {
				if existing, rerr := txRepo.FindCaptureByEvent(ctx, businessID, it.ClientEventID); rerr == nil {
					out = ItemResult{ClientEventID: it.ClientEventID, Result: "duplicate", Payment: existing}
					return nil
				}
				if rec.MpesaReceipt != nil {
					if existing, rerr := txRepo.FindCaptureByReceipt(ctx, businessID, *rec.MpesaReceipt); rerr == nil {
						return txSvc.applyMerge(ctx, tx, businessID, existing, rec, &out)
					}
				}
			}
			return err
		}
		sqlTx, _ := tx.Statement.ConnPool.(*sql.Tx)
		if err := txSvc.emit(ctx, sqlTx, businessID, rec.ID, PaymentCaptured, capturePayload(&rec)); err != nil {
			return err
		}
		out = ItemResult{ClientEventID: it.ClientEventID, Result: "created", Payment: &rec}
		return nil
	})
	if err != nil {
		s.logger.ErrorContext(ctx, "[PAYMENTS]-ingest item failed", "businessID", businessID.String(), "err", err.Error())
		if shareddb.IsDuplicateKey(err) {
			return ItemResult{ClientEventID: it.ClientEventID, Result: "duplicate"}
		}
		return fail("internal")
	}
	return out
}

// applyMerge persists a DecideMerge outcome + outbox event inside the
// caller's transaction. Pure decision, transactional effects.
func (s *Service) applyMerge(ctx context.Context, tx *gorm.DB, businessID uuid.UUID, existing *CapturedPayment, incoming CapturedPayment, out *ItemResult) error {
	txRepo := s.repo.WithTx(tx)
	sqlTx, _ := tx.Statement.ConnPool.(*sql.Tx)
	switch d := DecideMerge(existing, incoming); d.Action {
	case MergeDuplicate:
		*out = ItemResult{ClientEventID: incoming.ClientEventID, Result: "duplicate", Payment: existing}
		return nil
	case MergeMerged:
		if d.UpgradeTo != nil {
			if err := txRepo.UpdateCapture(ctx, d.UpgradeTo); err != nil {
				return err
			}
			if err := s.emit(ctx, sqlTx, businessID, d.UpgradeTo.ID, PaymentMerged, capturePayload(d.UpgradeTo)); err != nil {
				return err
			}
			*out = ItemResult{ClientEventID: incoming.ClientEventID, Result: "merged", Payment: d.UpgradeTo}
			return nil
		}
		*out = ItemResult{ClientEventID: incoming.ClientEventID, Result: "merged", Payment: existing}
		return nil
	case MergeDisputed:
		if err := txRepo.UpdateCapture(ctx, d.UpgradeTo); err != nil {
			return err
		}
		if err := txRepo.CreateCapture(ctx, d.DisputeWith); err != nil {
			return err
		}
		if err := s.emit(ctx, sqlTx, businessID, d.DisputeWith.ID, PaymentDisputed, capturePayload(d.DisputeWith)); err != nil {
			return err
		}
		*out = ItemResult{ClientEventID: incoming.ClientEventID, Result: "disputed", Payment: d.DisputeWith}
		return nil
	default:
		return fmt.Errorf("unknown merge action %v", d.Action)
	}
}

type RegisterDeviceRequest struct {
	Platform      string `json:"platform"`
	AppVersion    string `json:"appVersion"`
	ParserVersion string `json:"parserVersion"`
}

func (s *Service) RegisterDevice(ctx context.Context, businessID uuid.UUID, req RegisterDeviceRequest) (*CaptureDevice, error) {
	platform := req.Platform
	if platform == "" {
		platform = "android"
	}
	d := &CaptureDevice{
		TenantModel: shareddb.TenantModel{TenantID: businessID},
		BusinessID:  businessID,
		Platform:    platform,
	}
	if req.AppVersion != "" {
		d.AppVersion = &req.AppVersion
	}
	if req.ParserVersion != "" {
		d.ParserVersion = &req.ParserVersion
	}
	if err := s.repo.CreateDevice(ctx, d); err != nil {
		return nil, err
	}
	return d, nil
}

func (s *Service) ListCaptured(ctx context.Context, businessID uuid.UUID, f CaptureFilter) ([]CapturedPayment, error) {
	return s.repo.ListCaptured(ctx, businessID, f)
}

// --- HTTP handlers (same Handler struct, new methods) ---

func strictDecodeBody(r *http.Request, dst any) error {
	defer r.Body.Close()
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	return dec.Decode(dst)
}

func (h Handler) Ingest(w http.ResponseWriter, r *http.Request) {
	bid, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}
	var items []IngestItem
	if err := strictDecodeBody(r, &items); err != nil {
		sharedhttp.Error(w, apperrors.ErrUnprocessable.WithMessage("invalid batch: array of up to 50 items, known fields only"))
		return
	}
	if len(items) == 0 || len(items) > MaxIngestBatch {
		sharedhttp.Error(w, apperrors.ErrUnprocessable.WithMessage("batch must hold 1-50 items"))
		return
	}
	results := h.svc.Ingest(r.Context(), bid, items)
	sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"results": results})
}

func (h Handler) RegisterDevice(w http.ResponseWriter, r *http.Request) {
	bid, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}
	var req RegisterDeviceRequest
	if err := sharedhttp.Decode(r, &req); err != nil {
		sharedhttp.Error(w, err)
		return
	}
	d, err := h.svc.RegisterDevice(r.Context(), bid, req)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusCreated, d)
}

func (h Handler) ListCaptured(w http.ResponseWriter, r *http.Request) {
	bid, ok := middleware.BusinessIDFromCtx(r.Context())
	if !ok {
		sharedhttp.Error(w, errBusinessRequired())
		return
	}
	q := r.URL.Query()
	items, err := h.svc.ListCaptured(r.Context(), bid, CaptureFilter{
		Source:  q.Get("source"),
		Status:  q.Get("status"),
		Channel: q.Get("channel"),
		From:    q.Get("from"),
		To:      q.Get("to"),
		Page:    pagination.FromRequest(r),
	})
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"payments": items})
}
