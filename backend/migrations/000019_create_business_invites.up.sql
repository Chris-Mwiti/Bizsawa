-- Invite via email with OTP and role assignment
-- OWNER can invite any role, MANAGER only CASHIER. Manager restriction enforced in service layer.

CREATE TABLE IF NOT EXISTS business_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('MANAGER','CASHIER','VIEWER')),
    otp_hash TEXT NOT NULL,
    invited_by UUID NOT NULL REFERENCES auth_users(id),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_business_invites_business_email ON business_invites(business_id, email);
CREATE INDEX IF NOT EXISTS idx_business_invites_email ON business_invites(email);
CREATE INDEX IF NOT EXISTS idx_business_invites_expires ON business_invites(expires_at);
-- NOTE: cannot use NOW() in partial index predicate (must be IMMUTABLE). Use used_at IS NULL only;
-- expiry is enforced in queries (WHERE expires_at > NOW()) and service refreshes/cleans expired rows.
CREATE UNIQUE INDEX IF NOT EXISTS idx_business_invites_pending_unique ON business_invites(business_id, email) WHERE used_at IS NULL;
