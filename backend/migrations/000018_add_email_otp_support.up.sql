-- Better-Auth Email OTP parity: Agents_Documents/BetterAuth/EmailOTP.md
-- types: sign-in, email-verification, forget-password
-- Covers forget-password option + email verification

CREATE TABLE IF NOT EXISTS auth_otps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    otp_hash TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('sign-in','email-verification','forget-password')),
    expires_at TIMESTAMPTZ NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auth_otps_email_type ON auth_otps(email, type, expires_at);
CREATE INDEX IF NOT EXISTS idx_auth_otps_expires ON auth_otps(expires_at);
