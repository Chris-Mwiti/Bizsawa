package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/Codecx-Org/FinAI/backend/internal/shared/config"
)

// GoogleIDToken mirrors better-auth idToken: {token, accessToken} per GoogleSocialLogin.md Cross-Platform
type GoogleIDToken struct {
	Token       string `json:"token"`
	AccessToken string `json:"accessToken"`
}

type GoogleLoginRequest struct {
	// better-auth shape: {idToken: {token, accessToken}}
	IDToken *GoogleIDToken `json:"idToken"`
	// flat fallbacks for direct mobile use
	Token       string     `json:"token"`
	IDTokenStr  string     `json:"id_token"`
	AccessToken string     `json:"accessToken"`
	BusinessID  *uuid.UUID `json:"businessId"`
}

type googleTokenInfo struct {
	Sub           string `json:"sub"`
	Email         string `json:"email"`
	EmailVerified string `json:"email_verified"` // "true"/"false"
	Name          string `json:"name"`
	Picture       string `json:"picture"`
	Hd            string `json:"hd"`
	Aud           string `json:"aud"`
	Iss           string `json:"iss"`
	Exp           string `json:"exp"`
}

func (s *Service) LoginWithGoogle(ctx context.Context, req GoogleLoginRequest) (*AuthResponse, error) {
	rawIDToken := ""
	accessTok := ""
	if req.IDToken != nil {
		rawIDToken = strings.TrimSpace(req.IDToken.Token)
		accessTok = strings.TrimSpace(req.IDToken.AccessToken)
	}
	if rawIDToken == "" {
		rawIDToken = strings.TrimSpace(req.Token)
	}
	if rawIDToken == "" {
		rawIDToken = strings.TrimSpace(req.IDTokenStr)
	}
	if rawIDToken == "" {
		rawIDToken = strings.TrimSpace(req.AccessToken) // not ideal but fallback
	}
	if accessTok == "" {
		accessTok = strings.TrimSpace(req.AccessToken)
	}
	if rawIDToken == "" {
		return nil, ErrUnauthorized.WithMessage("missing id_token")
	}

	info, err := s.verifyGoogleIDToken(ctx, rawIDToken)
	if err != nil {
		return nil, ErrUnauthorized.WithMessage("invalid google id_token: " + err.Error())
	}

	// HD restriction per GoogleSocialLogin.md (hd: "company.com" or "*")
	if s.googleCfg != nil && s.googleCfg.HD != "" {
		expected := strings.TrimSpace(s.googleCfg.HD)
		if expected == "*" {
			if strings.TrimSpace(info.Hd) == "" {
				return nil, ErrUnauthorized.WithMessage("google workspace account required")
			}
		} else if !strings.EqualFold(info.Hd, expected) {
			return nil, ErrUnauthorized.WithMessage(fmt.Sprintf("google hd mismatch: expected %s", expected))
		}
	}

	email := strings.ToLower(strings.TrimSpace(info.Email))
	if email == "" {
		return nil, ErrUnauthorized.WithMessage("google email missing")
	}
	verified := info.EmailVerified == "true"
	sub := strings.TrimSpace(info.Sub)
	if sub == "" {
		return nil, ErrUnauthorized.WithMessage("google sub missing")
	}

	// Try provider link first (better-auth account table)
	if existing, err := s.repo.FindByProviderAccountID(ctx, "google", sub); err == nil && existing != nil {
		if !existing.IsActive {
			return nil, ErrInactiveUser
		}
		// update account tokens
		_ = s.repo.UpsertAccount(ctx, &Account{
			UserID:            existing.ID,
			Provider:          "google",
			ProviderAccountID: sub,
			AccessToken:       accessTok,
			IDToken:           rawIDToken,
			ExpiresAt:         nil,
		})
		// business scoping same as Login
		businessID := uuid.Nil
		roles := []string(nil)
		if req.BusinessID != nil && *req.BusinessID != uuid.Nil && s.memberships != nil {
			if role, err := s.memberships.RoleForUser(ctx, *req.BusinessID, existing.ID); err == nil {
				businessID = *req.BusinessID
				roles = []string{string(role)}
			}
		}
		return s.issue(ctx, existing.ID, businessID, businessID, roles)
	}
	// Also check account table directly (in case user migrated)
	if acc, err := s.repo.FindAccount(ctx, "google", sub); err == nil && acc != nil {
		if u, err := s.repo.FindByID(ctx, acc.UserID); err == nil {
			if !u.IsActive {
				return nil, ErrInactiveUser
			}
			_ = s.repo.UpsertAccount(ctx, &Account{
				UserID:            u.ID,
				Provider:          "google",
				ProviderAccountID: sub,
				AccessToken:       accessTok,
				IDToken:           rawIDToken,
			})
			businessID := uuid.Nil
			roles := []string(nil)
			if req.BusinessID != nil && *req.BusinessID != uuid.Nil && s.memberships != nil {
				if role, err := s.memberships.RoleForUser(ctx, *req.BusinessID, u.ID); err == nil {
					businessID = *req.BusinessID
					roles = []string{string(role)}
				}
			}
			return s.issue(ctx, u.ID, businessID, businessID, roles)
		}
	}

	// Find by email -> link (better-auth linking semantics)
	if u, err := s.repo.FindByEmail(ctx, email); err == nil && u != nil {
		// link google to existing credential user
		if !u.IsActive {
			return nil, ErrInactiveUser
		}
		// update user fields if missing
		updates := map[string]any{}
		if u.Provider == "credential" || u.Provider == "" {
			updates["provider"] = "google"
		}
		if u.ProviderAccountID == nil || *u.ProviderAccountID == "" {
			updates["provider_account_id"] = sub
		}
		if !verified {
			// keep existing verification but set if google says verified
		} else {
			updates["email_verified"] = true
		}
		if info.Picture != "" && u.Image == "" {
			updates["image"] = info.Picture
		}
		if info.Name != "" && u.Name == "" {
			updates["name"] = info.Name
		}
		if len(updates) > 0 {
			_ = s.repo.db.WithContext(ctx).Model(&User{}).Where("id = ?", u.ID).Updates(updates).Error
		}
		_ = s.repo.UpsertAccount(ctx, &Account{
			UserID:            u.ID,
			Provider:          "google",
			ProviderAccountID: sub,
			AccessToken:       accessTok,
			IDToken:           rawIDToken,
		})
		businessID := uuid.Nil
		roles := []string(nil)
		if req.BusinessID != nil && *req.BusinessID != uuid.Nil && s.memberships != nil {
			if role, err := s.memberships.RoleForUser(ctx, *req.BusinessID, u.ID); err == nil {
				businessID = *req.BusinessID
				roles = []string{string(role)}
			}
		}
		return s.issue(ctx, u.ID, businessID, businessID, roles)
	} else if !errors.Is(err, gorm.ErrRecordNotFound) && err != nil {
		return nil, err
	}

	// Create new google user (no password)
	newUser := &User{
		Email:         email,
		PasswordHash:  "", // SSO users have no password
		IsActive:      true,
		Name:          info.Name,
		Image:         info.Picture,
		EmailVerified: verified,
		Provider:      "google",
	}
	subCopy := sub
	newUser.ProviderAccountID = &subCopy
	if err := s.repo.CreateUser(ctx, newUser); err != nil {
		return nil, err
	}
	_ = s.repo.UpsertAccount(ctx, &Account{
		UserID:            newUser.ID,
		Provider:          "google",
		ProviderAccountID: sub,
		AccessToken:       accessTok,
		IDToken:           rawIDToken,
	})
	if s.subscriptions != nil {
		_ = s.subscriptions.EnsureDefaultSubscriptionForUser(ctx, newUser.ID)
	}
	businessID := uuid.Nil
	if req.BusinessID != nil {
		businessID = *req.BusinessID
	}
	return s.issue(ctx, newUser.ID, businessID, businessID, nil)
}

func (s *Service) verifyGoogleIDToken(ctx context.Context, raw string) (*googleTokenInfo, error) {
	// Fast path: use Google tokeninfo endpoint (no extra deps). Verifies signature, aud, iss, exp server-side.
	// For prod hardening, prefer google.golang.org/api/idtoken.Validate with certs. Kept simple for offline-verifiable flow.
	// Supports cross-platform clientIds array per BetterAuth docs.
	if strings.Count(raw, ".") != 2 {
		return nil, errors.New("malformed jwt")
	}
	// Call tokeninfo — respects aud via server validation; we additionally check aud locally.
	url := "https://oauth2.googleapis.com/tokeninfo?id_token=" + raw
	req, _ := http.NewRequestWithContext(ctx, "GET", url, nil)
	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("tokeninfo fetch failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("tokeninfo status %d", resp.StatusCode)
	}
	var info googleTokenInfo
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return nil, fmt.Errorf("decode tokeninfo: %w", err)
	}
	// iss check
	if info.Iss != "https://accounts.google.com" && info.Iss != "accounts.google.com" {
		return nil, fmt.Errorf("invalid iss %s", info.Iss)
	}
	// aud check against allowed clientIds
	if s.googleCfg != nil && len(s.googleCfg.ClientIDs) > 0 {
		allowed := false
		for _, cid := range s.googleCfg.ClientIDs {
			if strings.TrimSpace(cid) == strings.TrimSpace(info.Aud) {
				allowed = true
				break
			}
		}
		if !allowed {
			return nil, fmt.Errorf("aud mismatch %s not in allowed %v", info.Aud, s.googleCfg.ClientIDs)
		}
	}
	// exp check
	if expStr := strings.TrimSpace(info.Exp); expStr != "" {
		var expInt int64
		fmt.Sscan(expStr, &expInt)
		if expInt > 0 && time.Now().Unix() > expInt+60 {
			return nil, errors.New("token expired")
		}
	}
	return &info, nil
}

// GoogleConfig wiring helper
func (s *Service) WithGoogleConfig(cfg config.GoogleConfig) {
	s.googleCfg = &cfg
}

// Ensure Service has googleCfg field (added via embedding)
// We store it via interface to avoid import cycle - add field directly in service.go
