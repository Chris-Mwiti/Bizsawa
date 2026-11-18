package powersync

import (
	"encoding/base64"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/Codecx-Org/FinAI/backend/internal/shared/config"
)

// Claims is the PowerSync client JWT. The sync streams read business_id via
// auth.parameter('business_id'), so it must be a top-level string claim.
type Claims struct {
	jwt.RegisteredClaims
	BusinessID string `json:"business_id"`
}

type TokenService struct {
	signingKey []byte
	keyID      string
	issuer     string
	audience   string
	ttl        time.Duration
	url        string
}

func NewTokenService(cfg config.PowerSyncConfig) *TokenService {
	if cfg.JWTTTL <= 0 {
		cfg.JWTTTL = 15 * time.Minute
	}

	if cfg.JWTKeyID == "" {
		cfg.JWTKeyID = "powersync-dev"
	}

	if cfg.JWTIssuer == "" {
		cfg.JWTIssuer = "bizsawa"
	}

	if cfg.JWTAudience == "" {
		cfg.JWTAudience = "powersync"
	}

	return &TokenService{
		signingKey: signingKey(cfg.JWTSigningKey),
		keyID:      cfg.JWTKeyID,
		issuer:     cfg.JWTIssuer,
		audience:   cfg.JWTAudience,
		ttl:        cfg.JWTTTL,
		url:        cfg.URL,
	}
}

// signingKey accepts a base64url-encoded key (what PowerSync's client_auth.jwks
// expects) and falls back to the raw string for operator convenience.
func signingKey(raw string) []byte {
	raw = strings.TrimSpace(raw)

	if decoded, err := base64.RawURLEncoding.DecodeString(raw); err == nil && len(decoded) > 0 {
		return decoded
	}

	if decoded, err := base64.URLEncoding.DecodeString(raw); err == nil && len(decoded) > 0 {
		return decoded
	}

	return []byte(raw)
}

func (s *TokenService) URL() string { return s.url }

// Mint returns a short-lived HS256 JWT for the authenticated user/business.
func (s *TokenService) Mint(userID, businessID uuid.UUID) (string, time.Time, error) {
	now := time.Now().UTC()
	expires := now.Add(s.ttl)

	claims := Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    s.issuer,
			Subject:   userID.String(),
			Audience:  jwt.ClaimStrings{s.audience},
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(expires),
		},
		BusinessID: businessID.String(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	token.Header["kid"] = s.keyID

	signed, err := token.SignedString(s.signingKey)
	if err != nil {
		return "", time.Time{}, err
	}

	return signed, expires, nil
}
