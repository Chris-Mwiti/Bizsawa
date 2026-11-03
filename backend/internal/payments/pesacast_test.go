package payments

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"

	sharedconfig "github.com/Codecx-Org/FinAI/backend/internal/shared/config"
)

func TestPesacastSignatureVector(t *testing.T) {
	got := ""
	_ = got
	// Covered by pesacastVerifySignature usage; vector check via auth helper.
	secret := "s3cret"
	body := []byte(`{"a":1}`)
	ts := "1700000000"
	sig := "v1=1698a50bc74d1ff1db85c4e0a5297c2ad9fdba245d5737cdb789e4cc6e098940"
	cfg := sharedconfig.PesaCastConfig{SigningSecret: secret, MaxClockSkew: 5 * time.Minute}
	h := http.Header{}
	h.Set("X-PesaCast-Timestamp", ts)
	h.Set("X-PesaCast-Signature", sig)
	if !PesacastAuth(cfg, h, body, time.Unix(1700000000, 0)) {
		t.Fatal("expected valid signature")
	}
}

func TestPesacastAuthStaleTimestamp(t *testing.T) {
	secret := "s3cret"
	body := []byte(`{"a":1}`)
	cfg := sharedconfig.PesaCastConfig{SigningSecret: secret, MaxClockSkew: 5 * time.Minute}
	h := http.Header{}
	h.Set("X-PesaCast-Timestamp", "1700000000")
	h.Set("X-PesaCast-Signature", "v1=1698a50bc74d1ff1db85c4e0a5297c2ad9fdba245d5737cdb789e4cc6e098940")
	if PesacastAuth(cfg, h, body, time.Unix(1700000000+3600, 0)) {
		t.Fatal("stale timestamp should fail")
	}
}

func TestPesacastAuthBearerOnly(t *testing.T) {
	cfg := sharedconfig.PesaCastConfig{BearerToken: "tok"}
	h := http.Header{}
	h.Set("Authorization", "Bearer tok")
	if !PesacastAuth(cfg, h, []byte(`{}`), time.Now()) {
		t.Fatal("bearer should pass")
	}
	h2 := http.Header{}
	h2.Set("Authorization", "Bearer nope")
	if PesacastAuth(cfg, h2, []byte(`{}`), time.Now()) {
		t.Fatal("bad bearer should fail")
	}
}

func TestPesacastWebhookTestPing(t *testing.T) {
	svc := &Service{logger: nil}
	// Ingest not needed for test ping; HandlePesacastWebhook returns early.
	body := map[string]any{
		"schema_version": 1,
		"source":         "android",
		"device_id":      "dev-1",
		"exported_at":    "2026-10-24T10:00:01Z",
		"test":           true,
		"transactions":   []any{},
		"count":          0,
	}
	raw, _ := json.Marshal(body)
	status, msg := svc.HandlePesacastWebhook(context.Background(), uuid.New(), http.Header{}, raw, sharedconfig.PesaCastConfig{AllowInsecure: true}, time.Now())
	if status != http.StatusNoContent {
		t.Fatalf("status = %d msg=%s", status, msg)
	}
}


