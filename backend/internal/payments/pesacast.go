package payments

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	sharedconfig "github.com/Codecx-Org/FinAI/backend/internal/shared/config"
	sharedhttp "github.com/Codecx-Org/FinAI/backend/internal/shared/http"
)

// pesacastPayload mirrors docs/webhook-payload.schema.json (v1).
type pesacastPayload struct {
	SchemaVersion int                  `json:"schema_version"`
	Source        string               `json:"source"`
	DeviceID      string               `json:"device_id"`
	ExportedAt    string               `json:"exported_at"`
	Test          bool                 `json:"test"`
	Transactions  []pesacastTransaction `json:"transactions"`
	Count         int                  `json:"count"`
}

type pesacastTransaction struct {
	Type            string   `json:"type"`
	Direction       string   `json:"direction"`
	Amount          float64  `json:"amount"`
	Currency        string   `json:"currency"`
	From            string   `json:"from"`
	Ref             string   `json:"ref"`
	Time            string   `json:"time"`
	Balance         float64  `json:"balance"`
	TransactionCost *float64 `json:"transaction_cost"`
}

// PesacastAuth reports whether the request proves itself via a fresh valid
// signature or the configured bearer token. Constant-time compares only.
func PesacastAuth(cfg sharedconfig.PesaCastConfig, headers http.Header, body []byte, now time.Time) bool {
	if cfg.AllowInsecure {
		return true
	}
	if cfg.SigningSecret != "" {
		timestamp := headers.Get("X-PesaCast-Timestamp")
		signature := headers.Get("X-PesaCast-Signature")
		if signature != "" && pesacastVerifySignature(cfg.SigningSecret, timestamp, signature, body, now, cfg.MaxClockSkew) {
			return true
		}
	}
	if cfg.BearerToken != "" {
		supplied := headers.Get("Authorization")
		expected := "Bearer " + cfg.BearerToken
		if subtle.ConstantTimeCompare([]byte(supplied), []byte(expected)) == 1 {
			return true
		}
	}
	return false
}

func pesacastVerifySignature(secret, timestamp, signature string, body []byte, now time.Time, skew time.Duration) bool {
	ts, err := strconv.ParseFloat(timestamp, 64)
	if err != nil {
		return false
	}
	if math.Abs(now.Sub(time.Unix(0, int64(ts*float64(time.Second)))).Seconds()) > skew.Seconds() {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(timestamp))
	mac.Write([]byte("."))
	mac.Write(body)
	expected := "v1=" + hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(signature), []byte(expected))
}

// HandlePesacastWebhook implements the receiver contract and returns an HTTP
// status code plus a short message. It never logs raw bodies or secrets.
func (s *Service) HandlePesacastWebhook(ctx context.Context, businessID uuid.UUID, headers http.Header, raw []byte, cfg sharedconfig.PesaCastConfig, now time.Time) (int, string) {
	_ = ctx
	_ = cfg
	_ = now

	var payload pesacastPayload
	if err := json.Unmarshal(raw, &payload); err != nil {
		return http.StatusBadRequest, "body is not a JSON object"
	}
	if payload.Test {
		return http.StatusNoContent, "test ping"
	}

	if payload.SchemaVersion != 0 && payload.SchemaVersion != 1 {
		// Unknown schema: acknowledge so the phone does not drop data.
		return http.StatusOK, "stored unparsed (unknown schema_version)"
	}

	items := make([]IngestItem, 0, len(payload.Transactions))
	for _, txn := range payload.Transactions {
		// Only incoming money is a captured payment candidate.
		if txn.Direction != "received" && txn.Direction != "paid" {
			continue
		}
		if txn.Ref == "" || txn.Time == "" {
			return http.StatusBadRequest, "malformed transaction"
		}
		if txn.Amount <= 0 {
			return http.StatusBadRequest, "malformed transaction"
		}
		currency := txn.Currency
		if currency == "" {
			currency = "KES"
		}
		if len(currency) != 3 {
			return http.StatusBadRequest, "malformed transaction"
		}
		occurred, err := time.Parse(time.RFC3339, txn.Time)
		if err != nil {
			return http.StatusBadRequest, "malformed transaction"
		}
		receipt := txn.Ref
		amountMinor := int64(math.Round(txn.Amount * 100))
		eventID := uuid.NewSHA1(uuid.NameSpaceURL, []byte(businessID.String()+"|"+txn.Ref+"|"+txn.Time))
		item := IngestItem{
			ClientEventID: eventID,
			MpesaReceipt:  &receipt,
			AmountMinor:   amountMinor,
			Currency:      currency,
			OccurredAt:    occurred.UTC(),
			ChannelType:   string(ChannelUnknown),
			Source:        string(SourceSMSDevice),
		}
		if txn.From != "" {
			hash := sha256.Sum256([]byte(strings.TrimSpace(txn.From)))
			h := hex.EncodeToString(hash[:])
			item.PayerHash = &h
		}
		items = append(items, item)
	}

	if len(items) == 0 {
		return http.StatusOK, "0 new transaction(s)"
	}

	results := s.Ingest(ctx, businessID, items)
	// Count created/merged/disputed as accepted.
	newCount := 0
	for _, r := range results {
		if r.Result == "created" || r.Result == "merged" || r.Result == "disputed" {
			newCount++
		}
	}
	return http.StatusOK, fmt.Sprintf("%d new transaction(s)", newCount)
}

// PesacastWebhook is the HTTP handler. It reads raw bytes first so the
// signature covers the body exactly as sent.
func (h Handler) PesacastWebhook(w http.ResponseWriter, r *http.Request) {
	businessID, err := uuid.Parse(chi.URLParam(r, "businessID"))
	if err != nil {
		sharedhttp.JSON(w, http.StatusBadRequest, sharedhttp.Envelope{"error": "invalid business id"})
		return
	}

	maxBytes := int64(1 << 20)
	if h.pesacastCfg.MaxBodyBytes > 0 {
		maxBytes = h.pesacastCfg.MaxBodyBytes
	}
	raw, err := io.ReadAll(io.LimitReader(r.Body, maxBytes+1))
	if err != nil {
		sharedhttp.JSON(w, http.StatusBadRequest, sharedhttp.Envelope{"error": "could not read body"})
		return
	}
	if int64(len(raw)) > maxBytes {
		w.WriteHeader(http.StatusRequestEntityTooLarge)
		return
	}
	defer r.Body.Close()

	now := time.Now().UTC()
	if !PesacastAuth(h.pesacastCfg, r.Header, raw, now) {
		sharedhttp.JSON(w, http.StatusUnauthorized, sharedhttp.Envelope{"error": "unauthorized"})
		return
	}

	status, msg := h.svc.HandlePesacastWebhook(r.Context(), businessID, r.Header, raw, h.pesacastCfg, now)
	if status == http.StatusNoContent {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if msg != "" {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	}
	w.WriteHeader(status)
	if msg != "" {
		_, _ = w.Write([]byte(msg + "\n"))
	}
}
