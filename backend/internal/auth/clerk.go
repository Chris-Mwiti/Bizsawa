package auth

import (
	"context"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/Codecx-Org/FinAI/backend/internal/shared/config"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/sync/singleflight"
	"gorm.io/gorm"
)

type ClerkVerifier struct {
	cfg       config.ClerkConfig
	jwksCache map[string]*rsa.PublicKey
	mu        sync.RWMutex
	fetch     singleflight.Group
}

func NewClerkVerifier(cfg config.ClerkConfig) *ClerkVerifier {
	return &ClerkVerifier{
		cfg:       cfg,
		jwksCache: make(map[string]*rsa.PublicKey),
	}
}

type ClerkClaims struct {
	jwt.RegisteredClaims
	SessionID     string `json:"sid"`
	Email         string `json:"email"`
	FirstName     string `json:"given_name"`
	LastName      string `json:"family_name"`
	ImageURL      string `json:"picture"`
	EmailVerified bool   `json:"email_verified"`
}

func (v *ClerkVerifier) VerifyToken(ctx context.Context, tokenString string) (*ClerkClaims, error) {
	if v.cfg.JWKSURL == "" {
		return nil, errors.New("clerk JWKS URL not configured")
	}

	parser := jwt.NewParser(jwt.WithValidMethods([]string{"RS256"}))
	token, err := parser.ParseWithClaims(tokenString, &ClerkClaims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}

		kid, ok := token.Header["kid"].(string)
		if !ok {
			return nil, errors.New("missing kid in token header")
		}

		key, err := v.getKey(ctx, kid)
		if err != nil {
			return nil, err
		}
		return key, nil
	})

	if err != nil {
		return nil, fmt.Errorf("token parse failed: %w", err)
	}

	if claims, ok := token.Claims.(*ClerkClaims); ok && token.Valid {
		if claims.Subject == "" {
			return nil, errors.New("missing user ID (sub) in token")
		}
		return claims, nil
	}

	return nil, errors.New("invalid token claims")
}

func (v *ClerkVerifier) getKey(ctx context.Context, kid string) (*rsa.PublicKey, error) {
	v.mu.RLock()
	if key, ok := v.jwksCache[kid]; ok {
		v.mu.RUnlock()
		return key, nil
	}
	v.mu.RUnlock()

	key, err, _ := v.fetch.Do(kid, func() (interface{}, error) {
		return v.fetchAndCacheKey(ctx, kid)
	})
	if err != nil {
		return nil, err
	}
	return key.(*rsa.PublicKey), nil
}

func (v *ClerkVerifier) fetchAndCacheKey(ctx context.Context, kid string) (*rsa.PublicKey, error) {
	if v.cfg.JWKSURL == "" {
		return nil, errors.New("clerk JWKS URL not configured")
	}

	req, err := http.NewRequestWithContext(ctx, "GET", v.cfg.JWKSURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create JWKS request: %w", err)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch JWKS: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("JWKS status: %d", resp.StatusCode)
	}

	var jwks struct {
		Keys []struct {
			KID string `json:"kid"`
			KTY string `json:"kty"`
			ALG string `json:"alg"`
			USE string `json:"use"`
			N   string `json:"n"`
			E   string `json:"e"`
		} `json:"keys"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&jwks); err != nil {
		return nil, fmt.Errorf("decode JWKS: %w", err)
	}

	for _, k := range jwks.Keys {
		if k.KID == kid && k.KTY == "RSA" {
			// JWKS carries the RSA key as base64url modulus (n) and exponent (e),
			// not as a PEM/DER key — decode them and rebuild the public key.
			nBytes, err := base64.RawURLEncoding.DecodeString(k.N)
			if err != nil {
				slog.ErrorContext(ctx, "failed to decode RSA modulus from JWKS", "kid", kid, "err", err)
				continue
			}

			eBytes, err := base64.RawURLEncoding.DecodeString(k.E)
			if err != nil {
				slog.ErrorContext(ctx, "failed to decode RSA exponent from JWKS", "kid", kid, "err", err)
				continue
			}

			exponent := 0
			for _, b := range eBytes {
				exponent = exponent<<8 | int(b)
			}

			if exponent == 0 {
				slog.ErrorContext(ctx, "invalid RSA exponent in JWKS", "kid", kid)
				continue
			}

			pubKey := &rsa.PublicKey{N: new(big.Int).SetBytes(nBytes), E: exponent}
			v.mu.Lock()
			v.jwksCache[kid] = pubKey
			v.mu.Unlock()

			return pubKey, nil
		}
	}

	return nil, fmt.Errorf("key not found for kid: %s", kid)
}

func (v *ClerkVerifier) ClearCache() {
	v.mu.Lock()
	v.jwksCache = make(map[string]*rsa.PublicKey)
	v.mu.Unlock()
}

type ClerkLoginRequest struct {
	Token      string  `json:"token"`
	BusinessID *string `json:"businessId,omitempty"`
}

type ClerkLoginResponse struct {
	UserID       string `json:"userId"`
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
}



func fetchClerkUserEmail(ctx context.Context, secretKey, userID string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", "https://api.clerk.com/v1/users/"+userID, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+secretKey)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("clerk api status %d", resp.StatusCode)
	}
	var body struct {
		EmailAddresses []struct {
			EmailAddress string `json:"email_address"`
		} `json:"email_addresses"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return "", err
	}
	if len(body.EmailAddresses) > 0 {
		return body.EmailAddresses[0].EmailAddress, nil
	}
	return "", nil
}

func (s *Service) LoginWithClerk(ctx context.Context, req ClerkLoginRequest) (*AuthResponse, error) {
	if s.clerkVerifier == nil {
		return nil, ErrUnauthorized.WithMessage("clerk not configured")
	}

	claims, err := s.clerkVerifier.VerifyToken(ctx, req.Token)
	if err != nil {
		return nil, ErrUnauthorized.WithMessage("invalid clerk token: " + err.Error())
	}

	email := strings.ToLower(strings.TrimSpace(claims.Email))
	if email == "" && s.clerkVerifier != nil && s.clerkVerifier.cfg.SecretKey != "" {
		// Clerk's default session token may omit email; fetch from Backend API.
		sub := strings.TrimSpace(claims.Subject)
		if sub != "" {
			fetched, err := fetchClerkUserEmail(ctx, s.clerkVerifier.cfg.SecretKey, sub)
			if err == nil && fetched != "" {
				email = strings.ToLower(strings.TrimSpace(fetched))
			}
		}
	}
	if email == "" {
		return nil, ErrUnauthorized.WithMessage("clerk email missing")
	}

	if !claims.EmailVerified {
		slog.WarnContext(ctx, "clerk email not verified", "email", email)
	}

	sub := strings.TrimSpace(claims.Subject)
	if sub == "" {
		return nil, ErrUnauthorized.WithMessage("clerk sub missing")
	}

	name := strings.TrimSpace(claims.FirstName + " " + claims.LastName)
	image := strings.TrimSpace(claims.ImageURL)

	businessID := uuid.Nil
	if req.BusinessID != nil && *req.BusinessID != "" {
		if parsed, err := uuid.Parse(*req.BusinessID); err == nil {
			businessID = parsed
		}
	}

	// Try provider link first (better-auth account table)
	if existing, err := s.repo.FindByProviderAccountID(ctx, "clerk", sub); err == nil && existing != nil {
		if !existing.IsActive {
			return nil, ErrInactiveUser
		}

		if err := s.repo.UpsertAccount(ctx, &Account{
			UserID:            existing.ID,
			Provider:          "clerk",
			ProviderAccountID: sub,
			IDToken:           req.Token,
		}); err != nil {
			slog.ErrorContext(ctx, "failed to upsert clerk account for existing user", "user", existing.ID, "err", err)
		}

		roles := []string(nil)
		if businessID != uuid.Nil && s.memberships != nil {
			if role, err := s.memberships.RoleForUser(ctx, businessID, existing.ID); err == nil {
				roles = []string{string(role)}
			}
		}

		return s.issue(ctx, existing.ID, businessID, businessID, roles)
	}

	if acc, err := s.repo.FindAccount(ctx, "clerk", sub); err == nil && acc != nil {
		if u, err := s.repo.FindByID(ctx, acc.UserID); err == nil {
			if !u.IsActive {
				return nil, ErrInactiveUser
			}

			if err := s.repo.UpsertAccount(ctx, &Account{
				UserID:            u.ID,
				Provider:          "clerk",
				ProviderAccountID: sub,
				IDToken:           req.Token,
			}); err != nil {
				slog.ErrorContext(ctx, "failed to upsert clerk account for linked user", "user", u.ID, "err", err)
			}

			roles := []string(nil)
			if businessID != uuid.Nil && s.memberships != nil {
				if role, err := s.memberships.RoleForUser(ctx, businessID, u.ID); err == nil {
					roles = []string{string(role)}
				}
			}

			return s.issue(ctx, u.ID, businessID, businessID, roles)
		}
	}

	if u, err := s.repo.FindByEmail(ctx, email); err == nil && u != nil {
		if !u.IsActive {
			return nil, ErrInactiveUser
		}

		updates := map[string]any{}
		if u.Provider == "credential" || u.Provider == "" {
			updates["provider"] = "clerk"
		}
		if u.ProviderAccountID == nil || *u.ProviderAccountID == "" {
			updates["provider_account_id"] = sub
		}
		if claims.EmailVerified {
			updates["email_verified"] = true
		}
		if image != "" && u.Image == "" {
			updates["image"] = image
		}
		if name != "" && u.Name == "" {
			updates["name"] = name
		}

		if len(updates) > 0 {
			if err := s.repo.db.WithContext(ctx).Model(&User{}).Where("id = ?", u.ID).Updates(updates).Error; err != nil {
				slog.ErrorContext(ctx, "failed to update user for clerk link", "user", u.ID, "err", err)
			}
		}

		if err := s.repo.UpsertAccount(ctx, &Account{
			UserID:            u.ID,
			Provider:          "clerk",
			ProviderAccountID: sub,
			IDToken:           req.Token,
		}); err != nil {
			slog.ErrorContext(ctx, "failed to upsert clerk account for email-linked user", "user", u.ID, "err", err)
		}

		roles := []string(nil)
		if businessID != uuid.Nil && s.memberships != nil {
			if role, err := s.memberships.RoleForUser(ctx, businessID, u.ID); err == nil {
				roles = []string{string(role)}
			}
		}

		return s.issue(ctx, u.ID, businessID, businessID, roles)
	} else if !errors.Is(err, gorm.ErrRecordNotFound) && err != nil {
		return nil, err
	}

	newUser := &User{
		Email:         email,
		PasswordHash:  "",
		IsActive:      true,
		Name:          name,
		Image:         image,
		EmailVerified: claims.EmailVerified,
		Provider:      "clerk",
	}
	subCopy := sub
	newUser.ProviderAccountID = &subCopy

	if err := s.repo.CreateUser(ctx, newUser); err != nil {
		return nil, err
	}

	if err := s.repo.UpsertAccount(ctx, &Account{
		UserID:            newUser.ID,
		Provider:          "clerk",
		ProviderAccountID: sub,
		IDToken:           req.Token,
	}); err != nil {
		slog.ErrorContext(ctx, "failed to upsert clerk account for new user", "user", newUser.ID, "err", err)
	}

	if s.subscriptions != nil {
		if err := s.subscriptions.EnsureDefaultSubscriptionForUser(ctx, newUser.ID); err != nil {
			slog.ErrorContext(ctx, "failed to ensure subscription for clerk user", "user", newUser.ID, "err", err)
		}
	}

	return s.issue(ctx, newUser.ID, businessID, businessID, nil)
}

func (s *Service) WithClerkVerifier(v *ClerkVerifier) {
	s.clerkVerifier = v
}
