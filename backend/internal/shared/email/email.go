package email

import (
	"context"
	"fmt"
	"log/slog"
	"strings"

	"github.com/resend/resend-go/v2"

	"github.com/Codecx-Org/FinAI/backend/internal/shared/config"
)

// Sender abstracts email delivery — Resend in production, log in dev/test.
type Sender interface {
	SendOTPEmail(ctx context.Context, toEmail, otp string, otpType string) error
	SendInviteEmail(ctx context.Context, toEmail, businessName, role, otp string) error
}

// NoopSender logs OTP instead of sending (dev fallback when RESEND_API_KEY missing).
type NoopSender struct{}

func (n *NoopSender) SendOTPEmail(ctx context.Context, toEmail, otp string, otpType string) error {
	slog.Info("email (noop) — OTP not sent via provider", "to", toEmail, "type", otpType, "otp", otp)
	return nil
}

func (n *NoopSender) SendInviteEmail(ctx context.Context, toEmail, businessName, role, otp string) error {
	slog.Info("email (noop) — invite not sent via provider", "to", toEmail, "business", businessName, "role", role, "otp", otp)
	return nil
}

// ResendSender delivers via Resend API (https://resend.com/docs/api-reference/emails/send-email).
type ResendSender struct {
	client    *resend.Client
	fromEmail string
	fromName  string
}

func NewResendSender(cfg config.EmailConfig) *ResendSender {
	client := resend.NewClient(cfg.ResendAPIKey)
	fromEmail := strings.TrimSpace(cfg.FromEmail)
	if fromEmail == "" {
		fromEmail = "noreply@bizsawa.com"
	}
	fromName := strings.TrimSpace(cfg.FromName)
	if fromName == "" {
		fromName = "BizSawa"
	}
	return &ResendSender{client: client, fromEmail: fromEmail, fromName: fromName}
}

func (r *ResendSender) SendOTPEmail(ctx context.Context, toEmail, otp string, otpType string) error {
	subject, html, text := buildOTPEmail(otp, otpType)
	from := fmt.Sprintf("%s <%s>", r.fromName, r.fromEmail)

	params := &resend.SendEmailRequest{
		From:    from,
		To:      []string{toEmail},
		Subject: subject,
		Html:    html,
		Text:    text,
		Tags: []resend.Tag{
			{Name: "category", Value: "otp"},
			{Name: "otp_type", Value: otpType},
		},
	}

	sent, err := r.client.Emails.SendWithContext(ctx, params)
	if err != nil {
		return fmt.Errorf("resend send failed: %w", err)
	}
	slog.Info("email sent via Resend", "to", toEmail, "type", otpType, "id", sent.Id)
	return nil
}

func (r *ResendSender) SendInviteEmail(ctx context.Context, toEmail, businessName, role, otp string) error {
	subject, html, text := buildInviteEmail(businessName, role, otp)
	from := fmt.Sprintf("%s <%s>", r.fromName, r.fromEmail)
	params := &resend.SendEmailRequest{
		From:    from,
		To:      []string{toEmail},
		Subject: subject,
		Html:    html,
		Text:    text,
		Tags: []resend.Tag{
			{Name: "category", Value: "invite"},
			{Name: "role", Value: role},
		},
	}
	sent, err := r.client.Emails.SendWithContext(ctx, params)
	if err != nil {
		return fmt.Errorf("resend invite send failed: %w", err)
	}
	slog.Info("invite email sent via Resend", "to", toEmail, "business", businessName, "role", role, "id", sent.Id)
	return nil
}

// NewSender returns ResendSender when RESEND_API_KEY is set, otherwise NoopSender.
// Set EMAIL_PROVIDER=log to force log mode even with a key.
func NewSender(cfg config.EmailConfig) Sender {
	provider := strings.ToLower(strings.TrimSpace(cfg.Provider))
	if provider == "log" || provider == "noop" {
		if provider == "log" {
			slog.Info("email provider forced to log mode via EMAIL_PROVIDER")
		}
		return &NoopSender{}
	}
	if strings.TrimSpace(cfg.ResendAPIKey) == "" {
		slog.Warn("RESEND_API_KEY not set — OTP emails will be logged only (set RESEND_API_KEY to enable delivery)")
		return &NoopSender{}
	}
	slog.Info("email provider: Resend", "from", cfg.FromEmail)
	return NewResendSender(cfg)
}

func buildInviteEmail(businessName, role, otp string) (subject, html, text string) {
	roleLabel := strings.Title(strings.ToLower(role))
	subject = fmt.Sprintf("You're invited to join %s as %s — code %s", businessName, roleLabel, otp)
	text = fmt.Sprintf("You've been invited to join %s on BizSawa as %s.\n\nYour invite code is: %s\n\nThis code expires in 24 hours.\n\nDon't have the app? Download it:\n- Android: https://play.google.com/store/apps/details?id=com.bizsawa.mobile\n- iOS: https://apps.apple.com/app/bizsawa\n\nAlready have the app? Open BizSawa → Login → \"Have an invite code?\" → enter your email (%s) and code %s to join as %s.\n\nIf you didn't expect this invite, you can ignore this email.\n\n— BizSawa", businessName, roleLabel, otp, businessName, otp, roleLabel)
	html = fmt.Sprintf(`<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#f6f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="background-color:#f6f7fb;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
          <tr><td style="background:#0f172a;padding:28px 32px;text-align:center;">
            <div style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:-0.02em;">BizSawa</div>
            <div style="color:#94a3b8;font-size:12px;margin-top:4px;letter-spacing:0.08em;text-transform:uppercase;">You're invited</div>
          </td></tr>
          <tr><td style="padding:32px 32px 8px 32px;">
            <h1 style="margin:0 0 8px 0;font-size:20px;line-height:28px;color:#0f172a;font-weight:700;">Join %s as %s</h1>
            <p style="margin:0;color:#475569;font-size:14px;line-height:22px;">You've been invited to collaborate on <strong>%s</strong> with the role <strong>%s</strong>. Use the code below to accept.</p>
          </td></tr>
          <tr><td align="center" style="padding:20px 32px;">
            <div style="display:inline-block;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:12px;padding:16px 28px;">
              <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#64748b;font-weight:600;margin-bottom:6px;">Invite code</div>
              <div style="font-size:32px;letter-spacing:0.32em;font-weight:800;color:#0f172a;font-variant-numeric:tabular-nums;">%s</div>
            </div>
          </td></tr>
          <tr><td style="padding:8px 32px 0 32px;">
            <p style="margin:0;color:#64748b;font-size:13px;line-height:20px;text-align:center;">This code expires in <strong style="color:#0f172a;">24 hours</strong>. Do not share it.</p>
          </td></tr>
          <tr><td style="padding:20px 32px 0 32px;">
            <p style="margin:0 0 8px 0;color:#0f172a;font-size:13px;font-weight:700;">Don't have the app?</p>
            <p style="margin:0;color:#475569;font-size:13px;line-height:20px;">
              <a href="https://play.google.com/store/apps/details?id=com.bizsawa.mobile" style="color:#0f172a;font-weight:600;">Download for Android</a> &nbsp;·&nbsp;
              <a href="https://apps.apple.com/app/bizsawa" style="color:#0f172a;font-weight:600;">Download for iOS</a><br/>
              Then open BizSawa → Login → “Have an invite code?” → enter your email and code.
            </p>
          </td></tr>
          <tr><td style="padding:20px 32px 0 32px;">
            <p style="margin:0;color:#475569;font-size:13px;line-height:20px;">Already have the app? Open BizSawa → Login → “Have an invite code?” → enter <strong>%s</strong> and code <strong>%s</strong>.</p>
          </td></tr>
          <tr><td style="padding:24px 32px 32px 32px;">
            <div style="background:#f8fafc;border-radius:10px;padding:14px 16px;text-align:center;">
              <p style="margin:0;color:#94a3b8;font-size:12px;line-height:18px;">If you didn't expect this invite, you can safely ignore this email.</p>
            </div>
          </td></tr>
          <tr><td style="padding:16px 32px 28px 32px;text-align:center;border-top:1px solid #f1f5f9;">
            <p style="margin:0;color:#94a3b8;font-size:11px;">© BizSawa · Secure invite via Resend</p>
          </td></tr>
        </table>
        <p style="margin:16px 0 0 0;color:#94a3b8;font-size:11px;">Need help? Contact support@bizsawa.com</p>
      </td></tr>
    </table>
  </body>
</html>`, businessName, roleLabel, businessName, roleLabel, otp, businessName, otp)
	return subject, html, text
}

func buildOTPEmail(otp, otpType string) (subject, html, text string) {
	var title, intro string
	switch otpType {
	case "email-verification":
		title = "Verify your email"
		intro = "Use the code below to verify your email address."
	case "forget-password":
		title = "Reset your password"
		intro = "Use the code below to reset your password. If you didn't request this, you can ignore this email."
	default: // sign-in
		title = "Your sign-in code"
		intro = "Use the code below to sign in to BizSawa."
	}
	subject = fmt.Sprintf("%s — %s", title, otp)

	text = fmt.Sprintf("%s\n\nYour verification code is: %s\n\nThis code expires in 5 minutes. Do not share it with anyone.\n\n— BizSawa", intro, otp)

	// Clean, email-client-safe HTML (inline styles only)
	html = fmt.Sprintf(`<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#f6f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="background-color:#f6f7fb;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
          <tr>
            <td style="background:#0f172a;padding:28px 32px;text-align:center;">
              <div style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:-0.02em;">BizSawa</div>
              <div style="color:#94a3b8;font-size:12px;margin-top:4px;letter-spacing:0.08em;text-transform:uppercase;">Business Management</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 8px 32px;">
              <h1 style="margin:0 0 8px 0;font-size:22px;line-height:28px;color:#0f172a;font-weight:700;">%s</h1>
              <p style="margin:0;color:#475569;font-size:14px;line-height:22px;">%s</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 32px;">
              <div style="display:inline-block;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:12px;padding:16px 28px;">
                <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#64748b;font-weight:600;margin-bottom:6px;">Verification code</div>
                <div style="font-size:32px;letter-spacing:0.32em;font-weight:800;color:#0f172a;font-variant-numeric:tabular-nums;">%s</div>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 0 32px;">
              <p style="margin:0;color:#64748b;font-size:13px;line-height:20px;text-align:center;">
                This code expires in <strong style="color:#0f172a;">5 minutes</strong>. Do not share it with anyone.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 32px 32px;">
              <div style="background:#f8fafc;border-radius:10px;padding:14px 16px;text-align:center;">
                <p style="margin:0;color:#94a3b8;font-size:12px;line-height:18px;">
                  If you didn't request this code, you can safely ignore this email.
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 28px 32px;text-align:center;border-top:1px solid #f1f5f9;">
              <p style="margin:0;color:#94a3b8;font-size:11px;line-height:16px;">
                © BizSawa · Secure OTP delivery via Resend
              </p>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0 0;color:#94a3b8;font-size:11px;">Need help? Contact support@bizsawa.com</p>
      </td></tr>
    </table>
  </body>
</html>`, title, intro, otp)

	return subject, html, text
}
