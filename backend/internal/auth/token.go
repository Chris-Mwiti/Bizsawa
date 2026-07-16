package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type Claims struct {
	jwt.RegisteredClaims
	UserID     uuid.UUID `json:"uid"`
	TenantID   uuid.UUID `json:"tid"`
	BusinessID uuid.UUID `json:"bid"`
	Roles      []string  `json:"roles"`
}

type TokenService struct {
	signingKey []byte
	issuer     string
	accessTTL  time.Duration
	refreshTTL time.Duration
}

func NewTokenService(cfg Config) *TokenService {
	if cfg.AccessTTL == 0 {
		cfg.AccessTTL = 60 * time.Minute
	}
	if cfg.RefreshTTL == 0 {
		cfg.RefreshTTL = 5 * 24 * time.Hour
	}
	return &TokenService{signingKey: []byte(cfg.SigningKey), issuer: cfg.Issuer, accessTTL: cfg.AccessTTL, refreshTTL: cfg.RefreshTTL}
}

func (s *TokenService) IssueAccessToken(userID, tenantID, businessID uuid.UUID, roles []string) (string, error) {
	now := time.Now().UTC()
	claims := Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer: s.issuer, 
			Subject: userID.String(), 
			IssuedAt: jwt.NewNumericDate(now), 
			ExpiresAt: jwt.NewNumericDate(now.Add(s.accessTTL))},
			UserID:           userID, 
			TenantID: tenantID, 
			BusinessID: businessID, 
			Roles: roles,
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(s.signingKey)
}

func (s *TokenService) Verify(raw string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(raw, &Claims{}, func(token *jwt.Token) (any, error) { 
		return s.signingKey, nil 
	})
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, jwt.ErrTokenInvalidClaims
	}
	return claims, nil
}

func (s *TokenService) NewRefreshToken() (raw string, hash string, expiresAt time.Time, err error) {
	buf := make([]byte, 32)
	if _, err = rand.Read(buf); err != nil {
		return "", "", time.Time{}, err
	}
	raw = base64.RawURLEncoding.EncodeToString(buf)
	return raw, HashRefreshToken(raw), time.Now().UTC().Add(s.refreshTTL), nil
}

func HashRefreshToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}
