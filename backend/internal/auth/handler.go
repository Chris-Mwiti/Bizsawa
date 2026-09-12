package auth

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"

	sharedhttp "github.com/Codecx-Org/FinAI/backend/internal/shared/http"
)

type Handler struct{ svc *Service }

func (h Handler) Register(w http.ResponseWriter, r *http.Request) {
	var req RegisterRequest
	if err := sharedhttp.Decode(r, &req); err != nil {
		sharedhttp.Error(w, err)
		return
	}

	resp, err := h.svc.Register(r.Context(), req)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}

	sharedhttp.JSON(w, http.StatusCreated, resp)
}

func (h Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := sharedhttp.Decode(r, &req); err != nil {
		sharedhttp.Error(w, err)
		return
	}

	resp, err := h.svc.Login(r.Context(), req)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}

	sharedhttp.JSON(w, http.StatusOK, resp)
}

func (h Handler) Refresh(w http.ResponseWriter, r *http.Request) {
	var req RefreshRequest
	if err := sharedhttp.Decode(r, &req); err != nil {
		sharedhttp.Error(w, err)
		return
	}

	resp, err := h.svc.Refresh(r.Context(), req)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}

	sharedhttp.JSON(w, http.StatusOK, resp)
}

func (h Handler) GoogleLogin(w http.ResponseWriter, r *http.Request) {
	var req GoogleLoginRequest
	if err := sharedhttp.Decode(r, &req); err != nil {
		slog.Error("google login decode failed", "err", err)
		sharedhttp.Error(w, err)
		return
	}
	resp, err := h.svc.LoginWithGoogle(r.Context(), req)
	if err != nil {
		slog.Error("google login failed", "err", err)
		sharedhttp.Error(w, err)
		return
	}
	slog.Info("google login succeeded", "userId", resp.UserID)
	sharedhttp.JSON(w, http.StatusOK, resp)
}

func (h Handler) GoogleRedirect(w http.ResponseWriter, r *http.Request) {
	if h.svc.googleCfg == nil || len(h.svc.googleCfg.ClientIDs) == 0 {
		sharedhttp.Error(w, fmt.Errorf("google sso not configured"))
		return
	}
	cfg := h.svc.googleCfg
	clientID := cfg.ClientIDs[0]
	base := strings.TrimSuffix(cfg.BaseURL, "/")
	if base == "" {
		scheme := "https"
		if r.TLS == nil {
			scheme = "http"
		}
		base = fmt.Sprintf("%s://%s", scheme, r.Host)
	}
	redirectURI := base + "/api/v1/auth/google/callback"
	// better-auth semantics: prompt, accessType, hd, include_granted_scopes
	params := url.Values{}
	params.Set("client_id", clientID)
	params.Set("redirect_uri", redirectURI)
	params.Set("response_type", "code")
	params.Set("scope", "openid email profile")
	if cfg.HD != "" {
		params.Set("hd", cfg.HD)
	}
	if cfg.Prompt != "" {
		params.Set("prompt", cfg.Prompt)
	} else {
		params.Set("prompt", "select_account")
	}
	if cfg.AccessType != "" {
		params.Set("access_type", cfg.AccessType)
	}
	if cfg.IncludeGrantedScopes {
		params.Set("include_granted_scopes", "true")
	}
	authURL := "https://accounts.google.com/o/oauth2/v2/auth?" + params.Encode()
	http.Redirect(w, r, authURL, http.StatusFound)
}

func (h Handler) GoogleCallback(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	if code == "" {
		slog.Error("google callback missing code", "query", r.URL.RawQuery)
		sharedhttp.Error(w, fmt.Errorf("missing code"))
		return
	}
	if h.svc.googleCfg == nil || len(h.svc.googleCfg.ClientIDs) == 0 {
		slog.Error("google callback not configured")
		sharedhttp.Error(w, fmt.Errorf("google sso not configured"))
		return
	}
	cfg := h.svc.googleCfg
	base := strings.TrimSuffix(cfg.BaseURL, "/")
	if base == "" {
		scheme := "https"
		if r.TLS == nil {
			scheme = "http"
		}
		base = fmt.Sprintf("%s://%s", scheme, r.Host)
	}
	redirectURI := base + "/api/v1/auth/google/callback"
	// Exchange code for tokens (web flow)
	form := url.Values{}
	form.Set("code", code)
	form.Set("client_id", cfg.ClientIDs[0])
	form.Set("client_secret", cfg.ClientSecret)
	form.Set("redirect_uri", redirectURI)
	form.Set("grant_type", "authorization_code")
	resp, err := http.PostForm("https://oauth2.googleapis.com/token", form)
	if err != nil {
		slog.Error("google token exchange failed", "err", err)
		sharedhttp.Error(w, err)
		return
	}
	defer resp.Body.Close()
	var tok struct {
		IDToken     string `json:"id_token"`
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tok); err != nil {
		slog.Error("google token decode failed", "err", err, "status", resp.Status)
		sharedhttp.Error(w, err)
		return
	}
	if tok.IDToken == "" {
		slog.Error("google callback no id_token", "status", resp.Status)
		sharedhttp.Error(w, fmt.Errorf("no id_token from google"))
		return
	}
	authResp, err := h.svc.LoginWithGoogle(r.Context(), GoogleLoginRequest{
		IDToken: &GoogleIDToken{Token: tok.IDToken, AccessToken: tok.AccessToken},
	})
	if err != nil {
		slog.Error("google callback LoginWithGoogle failed", "err", err)
		sharedhttp.Error(w, err)
		return
	}
	slog.Info("google callback succeeded", "userId", authResp.UserID)
	sharedhttp.JSON(w, http.StatusOK, authResp)
}

// Email OTP handlers — BetterAuth EmailOTP plugin parity

func (h Handler) SendVerificationOTP(w http.ResponseWriter, r *http.Request) {
	var req SendOTPRequest
	if err := sharedhttp.Decode(r, &req); err != nil {
		sharedhttp.Error(w, err)
		return
	}
	if err := h.svc.SendVerificationOTP(r.Context(), req); err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"status": "otp_sent"})
}

func (h Handler) CheckVerificationOTP(w http.ResponseWriter, r *http.Request) {
	var req CheckOTPRequest
	if err := sharedhttp.Decode(r, &req); err != nil {
		sharedhttp.Error(w, err)
		return
	}
	ok, err := h.svc.CheckVerificationOTP(r.Context(), req)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"valid": ok})
}

func (h Handler) SignInEmailOTP(w http.ResponseWriter, r *http.Request) {
	var req SignInOTPRequest
	if err := sharedhttp.Decode(r, &req); err != nil {
		sharedhttp.Error(w, err)
		return
	}
	resp, err := h.svc.SignInEmailOTP(r.Context(), req)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, resp)
}

func (h Handler) VerifyEmailOTP(w http.ResponseWriter, r *http.Request) {
	var req VerifyEmailOTPRequest
	if err := sharedhttp.Decode(r, &req); err != nil {
		sharedhttp.Error(w, err)
		return
	}
	if err := h.svc.VerifyEmailOTP(r.Context(), req); err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"status": "verified"})
}

func (h Handler) RequestPasswordResetOTP(w http.ResponseWriter, r *http.Request) {
	var req RequestPasswordResetOTPRequest
	if err := sharedhttp.Decode(r, &req); err != nil {
		sharedhttp.Error(w, err)
		return
	}
	if err := h.svc.RequestPasswordResetWithOTP(r.Context(), req); err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"status": "otp_sent"})
}

func (h Handler) ResetPasswordOTP(w http.ResponseWriter, r *http.Request) {
	var req ResetPasswordOTPRequest
	if err := sharedhttp.Decode(r, &req); err != nil {
		sharedhttp.Error(w, err)
		return
	}
	if err := h.svc.ResetPasswordWithOTP(r.Context(), req); err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"status": "password_reset"})
}

func (h Handler) CheckEmailExists(w http.ResponseWriter, r *http.Request) {
	email := r.URL.Query().Get("email")
	if email == "" {
		// also try JSON body for POST fallback
		var body struct{ Email string `json:"email"` }
		_ = sharedhttp.Decode(r, &body)
		if body.Email != "" {
			email = body.Email
		}
	}
	exists, err := h.svc.CheckEmailExists(r.Context(), email)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"exists": exists, "email": email})
}
