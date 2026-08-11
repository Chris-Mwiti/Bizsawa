package mcp

import (
	"errors"
	"net/http"
	"strings"

	"github.com/Codecx-Org/FinAI/backend/internal/shared/config"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

var ErrUnauthorized = errors.New("unauthorized")

type Claims struct {
	jwt.RegisteredClaims
	UserID           uuid.UUID `json:"uid"`
	TenantID         uuid.UUID `json:"tid"`
	BusinessID       uuid.UUID `json:"bid"`
	Roles            []string  `json:"roles"`
	SubscriptionPlan string    `json:"plan"`
}

type Authenticator struct {
	signingKey []byte
	issuer     string
	audience   string
}

func NewAuthenticator(jwtCfg config.JWTConfig, mcpCfg config.MCPConfig) *Authenticator {
	issuer := mcpCfg.AuthIssuer
	if issuer == "" {
		issuer = jwtCfg.Issuer
	}
	return &Authenticator{signingKey: []byte(jwtCfg.SigningKey), issuer: issuer, audience: mcpCfg.AuthAudience}
}

func (a *Authenticator) Authenticate(r *http.Request, profile Profile) (Session, error) {
	header := r.Header.Get("Authorization")
	if !strings.HasPrefix(header, "Bearer ") {
		return Session{}, ErrUnauthorized
	}
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(strings.TrimPrefix(header, "Bearer "), claims, func(token *jwt.Token) (any, error) {
		if token.Method.Alg() != jwt.SigningMethodHS256.Alg() {
			return nil, jwt.ErrTokenSignatureInvalid
		}
		return a.signingKey, nil
	}, jwt.WithIssuer(a.issuer), jwt.WithAudience(a.audience))
	if err != nil || !token.Valid {
		return Session{}, ErrUnauthorized
	}
	role := ""
	if len(claims.Roles) > 0 {
		role = claims.Roles[0]
	}
	if claims.SubscriptionPlan == "" {
		claims.SubscriptionPlan = "standard"
	}
	return Session{UserID: claims.UserID, TenantID: claims.TenantID, BusinessID: claims.BusinessID, Role: role, SubscriptionPlan: claims.SubscriptionPlan, Profile: profile, RequestID: r.Header.Get("X-Request-ID")}, nil
}
