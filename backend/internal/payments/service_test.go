package payments

import (
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

func TestResultEventSchema(t *testing.T) {
	event := ResultEvent{PaymentID: uuid.MustParse("00000000-0000-0000-0000-000000000001"), BusinessID: uuid.MustParse("00000000-0000-0000-0000-000000000002"), Status: StatusSucceeded, Provider: "mpesa", ProviderRequestID: "req-1", ProviderReceipt: "receipt-1", Amount: decimal.NewFromInt(500)}
	raw, err := json.Marshal(event)
	if err != nil {
		t.Fatal(err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"paymentId", "businessId", "status", "provider", "providerRequestId", "providerReceipt", "amount"} {
		if _, ok := decoded[key]; !ok {
			t.Fatalf("missing key %s in %s", key, raw)
		}
	}
	if decoded["status"] != string(StatusSucceeded) {
		t.Fatalf("status = %v", decoded["status"])
	}
}
