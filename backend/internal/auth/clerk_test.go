package auth

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/Codecx-Org/FinAI/backend/internal/shared/config"
)

// clerkTestConfig builds a ClerkConfig pointing at a test JWKS endpoint.
func clerkTestConfig(jwksURL string) config.ClerkConfig {
	return config.ClerkConfig{JWKSURL: jwksURL}
}

// TestClerkVerifierVerifiesJWKSToken signs a token with an RSA key, serves that
// key as a JWKS document (base64url modulus/exponent, as Clerk does), and checks
// the verifier accepts the token and rejects a tampered one.
func TestClerkVerifierVerifiesJWKSToken(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate rsa key: %v", err)
	}

	// JWKS payload: modulus/exponent are base64url without padding.
	modulus := base64.RawURLEncoding.EncodeToString(key.N.Bytes())
	exponent := base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.E)).Bytes())

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"keys": []map[string]string{{
				"kty": "RSA",
				"kid": "test-kid",
				"alg": "RS256",
				"use": "sig",
				"n":   modulus,
				"e":   exponent,
			}},
		})
	}))
	defer srv.Close()

	verifier := NewClerkVerifier(clerkTestConfig(srv.URL))

	claims := ClerkClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   "user_123",
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
		Email:         "user@example.com",
		EmailVerified: true,
	}

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	token.Header["kid"] = "test-kid"

	signed, err := token.SignedString(key)
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}

	got, err := verifier.VerifyToken(context.Background(), signed)
	if err != nil {
		t.Fatalf("verify token: %v", err)
	}

	if got.Subject != "user_123" {
		t.Fatalf("user id = %q, want user_123", got.Subject)
	}

	if got.Email != "user@example.com" {
		t.Fatalf("email = %q, want user@example.com", got.Email)
	}

	if !got.EmailVerified {
		t.Fatalf("expected email_verified = true")
	}

	// A token signed by a different key must not verify.
	otherKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate other rsa key: %v", err)
	}

	other := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	other.Header["kid"] = "test-kid"

	otherSigned, err := other.SignedString(otherKey)
	if err != nil {
		t.Fatalf("sign other token: %v", err)
	}

	if _, err := verifier.VerifyToken(context.Background(), otherSigned); err == nil {
		t.Fatalf("expected verification failure for token signed by a different key")
	}
}

// TestClerkVerifierCachesKey asserts the JWKS endpoint is fetched once and the
// key is served from cache afterwards.
func TestClerkVerifierCachesKey(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate rsa key: %v", err)
	}

	modulus := base64.RawURLEncoding.EncodeToString(key.N.Bytes())
	exponent := base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.E)).Bytes())

	fetches := 0

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fetches++
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"keys": []map[string]string{{
				"kty": "RSA", "kid": "test-kid", "alg": "RS256", "use": "sig",
				"n": modulus, "e": exponent,
			}},
		})
	}))
	defer srv.Close()

	verifier := NewClerkVerifier(clerkTestConfig(srv.URL))

	claims := ClerkClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   "user_123",
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
		Email: "user@example.com",
	}

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	token.Header["kid"] = "test-kid"

	signed, err := token.SignedString(key)
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}

	for i := 0; i < 3; i++ {
		if _, err := verifier.VerifyToken(context.Background(), signed); err != nil {
			t.Fatalf("verify %d: %v", i, err)
		}
	}

	if fetches != 1 {
		t.Fatalf("expected 1 JWKS fetch (cached after first), got %d", fetches)
	}
}
