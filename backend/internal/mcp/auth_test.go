package mcp

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/Codecx-Org/FinAI/backend/internal/shared/config"
)

func TestAuthenticatorRequiresAudience(t *testing.T) {
	authn := NewAuthenticator(config.JWTConfig{Issuer: "issuer", SigningKey: "secret"}, config.MCPConfig{AuthIssuer: "issuer", AuthAudience: "bizsawa-mcp"})
	token := tokenForTest(t, "issuer", []string{"other-audience"})
	req := httptest.NewRequest("POST", "/mcp/business-owner", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	if _, err := authn.Authenticate(req, ProfileBusinessOwner); err == nil {
		t.Fatal("expected audience validation failure")
	}
}

func TestAuthenticatorBuildsSession(t *testing.T) {
	authn := NewAuthenticator(config.JWTConfig{Issuer: "issuer", SigningKey: "secret"}, config.MCPConfig{AuthIssuer: "issuer", AuthAudience: "bizsawa-mcp"})
	token := tokenForTest(t, "issuer", []string{"bizsawa-mcp"})
	req := httptest.NewRequest("POST", "/mcp/customer-service", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("X-Request-ID", "req-1")

	session, err := authn.Authenticate(req, ProfileCustomerService)
	if err != nil {
		t.Fatalf("authenticate failed: %v", err)
	}

	if session.Profile != ProfileCustomerService || session.Role != "OWNER" || session.RequestID != "req-1" {
		t.Fatalf("unexpected session: %#v", session)
	}
}

func tokenForTest(t *testing.T, issuer string, audience []string) string {
	t.Helper()

	claims := Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    issuer,
			Audience:  audience,
			Subject:   uuid.NewString(),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
		UserID:     uuid.New(),
		TenantID:   uuid.New(),
		BusinessID: uuid.New(),
		Roles:      []string{"OWNER"},
	}

	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte("secret"))
	if err != nil {
		t.Fatal(err)
	}

	return token
}
