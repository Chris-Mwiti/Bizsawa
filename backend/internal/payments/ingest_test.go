package payments

import (
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
)

func validItem() IngestItem {
	receipt := "QHX7K2M9AB"
	hash := "abcdef0123456789abcdef0123456789"
	return IngestItem{
		ClientEventID: uuid.New(),
		MpesaReceipt:  &receipt,
		AmountMinor:   123450,
		Currency:      "KES",
		OccurredAt:    time.Now().UTC().Add(-time.Hour),
		ChannelType:   string(ChannelTill),
		Source:        string(SourceSMSDevice),
		PayerHash:     &hash,
	}
}

func TestValidateIngestItem(t *testing.T) {
	now := time.Now().UTC()

	t.Run("valid item accepted", func(t *testing.T) {
		if reason := ValidateIngestItem(now, validItem()); reason != "" {
			t.Fatalf("reason = %q, want accept", reason)
		}
	})

	cases := []struct {
		name   string
		mutate func(*IngestItem)
		want   string
	}{
		{"nil event id", func(i *IngestItem) { i.ClientEventID = uuid.Nil }, "client_event_id_required"},
		{"unknown source", func(i *IngestItem) { i.Source = "carrier_pigeon" }, "unknown_source"},
		{"unknown channel", func(i *IngestItem) { i.ChannelType = "crypto" }, "unknown_channel"},
		{"zero amount", func(i *IngestItem) { i.AmountMinor = 0 }, "amount_must_be_positive"},
		{"negative amount", func(i *IngestItem) { i.AmountMinor = -5 }, "amount_must_be_positive"},
		{"bad currency", func(i *IngestItem) { i.Currency = "KSHS" }, "currency_must_be_iso3"},
		{"missing receipt non-manual", func(i *IngestItem) { i.MpesaReceipt = nil }, "receipt_required"},
		{"manual may omit receipt", func(i *IngestItem) { i.Source = string(SourceManual); i.MpesaReceipt = nil }, ""},
		{"short receipt", func(i *IngestItem) { s := "AB12"; i.MpesaReceipt = &s }, "receipt_malformed"},
		{"receipt with spaces", func(i *IngestItem) { s := "QHX 7K2M9"; i.MpesaReceipt = &s }, "receipt_malformed"},
		{"zero time", func(i *IngestItem) { i.OccurredAt = time.Time{} }, "occurred_at_required"},
		{"future time", func(i *IngestItem) { i.OccurredAt = now.Add(time.Hour) }, "occurred_in_future"},
		{"ancient time", func(i *IngestItem) { i.OccurredAt = now.Add(-MaxCaptureAge - time.Hour) }, "occurred_too_old"},
		{"short hash", func(i *IngestItem) { s := "abc"; i.PayerHash = &s }, "payer_hash_length"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			it := validItem()
			tc.mutate(&it)
			if got := ValidateIngestItem(now, it); got != tc.want {
				t.Fatalf("reason = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestIngestItemToRecordDefaults(t *testing.T) {
	it := validItem()
	it.Currency = ""
	it.ChannelType = ""
	rec := it.toRecord(uuid.New())
	if rec.Currency != "KES" {
		t.Fatalf("currency = %q, want KES default", rec.Currency)
	}
	if rec.ChannelType != ChannelUnknown {
		t.Fatalf("channel = %q, want unknown default", rec.ChannelType)
	}
	if rec.VerificationStatus != StatusDeviceReported {
		t.Fatalf("status = %q, want device_reported", rec.VerificationStatus)
	}
	verified := it
	verified.Source = string(SourceDaraja)
	if rec := verified.toRecord(uuid.New()); rec.VerificationStatus != StatusVerified {
		t.Fatalf("daraja status = %q, want verified", rec.VerificationStatus)
	}
}

func TestCapturePayloadExcludesPayerHash(t *testing.T) {
	it := validItem()
	rec := it.toRecord(uuid.New())
	payload := capturePayload(&rec)
	for k := range payload {
		if strings.Contains(k, "hash") || strings.Contains(k, "payer") {
			t.Fatalf("payload leaks %q", k)
		}
	}
}
