package powersync

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/Codecx-Org/FinAI/backend/internal/shared/config"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/middleware"
)

const devKeyB64 = "cG93ZXJzeW5jLWRldi1vbmx5LWtleS0zMi1ieXRlcyEh"

func testConfig() config.PowerSyncConfig {
	return config.PowerSyncConfig{
		JWTSigningKey: devKeyB64,
		JWTKeyID:      "powersync-dev",
		JWTIssuer:     "bizsawa",
		JWTAudience:   "powersync",
		JWTTTL:        15 * time.Minute,
		URL:           "http://localhost:8090",
	}
}

func parseToken(t *testing.T, raw string) *Claims {
	t.Helper()

	claims := &Claims{}

	parsed, err := jwt.ParseWithClaims(raw, claims, func(token *jwt.Token) (any, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			t.Fatalf("unexpected signing method: %v", token.Header["alg"])
		}

		// Must match the base64url-decoded dev key PowerSync uses.
		return []byte("powersync-dev-only-key-32-bytes!!"), nil
	}, jwt.WithAudience("powersync"), jwt.WithIssuer("bizsawa"))
	if err != nil {
		t.Fatalf("parse token: %v", err)
	}

	if !parsed.Valid {
		t.Fatal("token is not valid")
	}

	if kid, _ := parsed.Header["kid"].(string); kid != "powersync-dev" {
		t.Fatalf("kid = %q, want powersync-dev", kid)
	}

	return claims
}

func TestMintIncludesBusinessIDClaim(t *testing.T) {
	svc := NewTokenService(testConfig())
	userID := uuid.New()
	businessID := uuid.New()

	raw, expires, err := svc.Mint(userID, businessID)
	if err != nil {
		t.Fatalf("mint: %v", err)
	}

	if time.Until(expires) > 15*time.Minute+time.Minute {
		t.Fatalf("unexpected expiry: %v", expires)
	}

	claims := parseToken(t, raw)
	if claims.BusinessID != businessID.String() {
		t.Fatalf("business_id = %q, want %q", claims.BusinessID, businessID)
	}
	if claims.Subject != userID.String() {
		t.Fatalf("sub = %q, want %q", claims.Subject, userID)
	}
}

func TestSigningKeyAcceptsRawFallback(t *testing.T) {
	raw := "raw key with spaces!@#"

	if got := string(signingKey(raw)); got != raw {
		t.Fatalf("signingKey = %q, want raw %q", got, raw)
	}
}

func newRouter(m *Module, userID, businessID *uuid.UUID) http.Handler {
	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			ctx := req.Context()
			if userID != nil {
				ctx = middleware.WithUserID(ctx, *userID)
			}
			if businessID != nil {
				ctx = middleware.WithBusinessID(ctx, *businessID)
			}
			next.ServeHTTP(w, req.WithContext(ctx))
		})
	})
	m.RegisterRoutes(r)

	return r
}

func TestHandlerToken(t *testing.T) {
	m := New(testConfig())
	userID := uuid.New()
	businessID := uuid.New()

	req := httptest.NewRequest(http.MethodPost, "/token", nil)
	rec := httptest.NewRecorder()
	newRouter(m, &userID, &businessID).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var body struct {
		Token        string `json:"token"`
		ExpiresAt    string `json:"expires_at"`
		PowerSyncURL string `json:"powersync_url"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode body: %v", err)
	}

	if body.Token == "" {
		t.Fatal("empty token")
	}
	if body.PowerSyncURL != "http://localhost:8090" {
		t.Fatalf("powersync_url = %q", body.PowerSyncURL)
	}

	if claims := parseToken(t, body.Token); claims.BusinessID != businessID.String() {
		t.Fatalf("business_id = %q, want %q", claims.BusinessID, businessID)
	}
}

func TestHandlerTokenRequiresUser(t *testing.T) {
	m := New(testConfig())
	businessID := uuid.New()

	req := httptest.NewRequest(http.MethodPost, "/token", nil)
	rec := httptest.NewRecorder()
	newRouter(m, nil, &businessID).ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}

func TestHandlerTokenRequiresBusiness(t *testing.T) {
	m := New(testConfig())
	userID := uuid.New()

	req := httptest.NewRequest(http.MethodPost, "/token", nil)
	rec := httptest.NewRecorder()
	newRouter(m, &userID, nil).ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", rec.Code)
	}
}
