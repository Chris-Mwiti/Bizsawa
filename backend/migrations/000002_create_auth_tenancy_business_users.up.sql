CREATE TABLE IF NOT EXISTS auth_users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    tenant_id   UUID,
    business_id UUID,
    roles       JSONB NOT NULL DEFAULT '[]'::jsonb,
    token_hash  TEXT NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auth_refresh_user ON auth_refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_refresh_business ON auth_refresh_tokens(business_id);
CREATE INDEX IF NOT EXISTS idx_auth_refresh_valid ON auth_refresh_tokens(token_hash, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS tenancy_subscriptions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    plan_code   TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'ACTIVE',
    started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ends_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status ON tenancy_subscriptions(user_id, status);

CREATE TABLE IF NOT EXISTS businesses (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL,
    owner_id    UUID NOT NULL REFERENCES auth_users(id) ON DELETE RESTRICT,
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL UNIQUE,
    currency    TEXT NOT NULL DEFAULT 'KES',
    timezone    TEXT NOT NULL DEFAULT 'Africa/Nairobi',
    tax_pin     TEXT,
    phone       TEXT,
    email       TEXT,
    address     TEXT,
    mpesa_payment_type TEXT,
    mpesa_shortcode_encrypted TEXT,
    mpesa_shortcode_index TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_businesses_tenant ON businesses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_businesses_owner ON businesses(owner_id);
CREATE INDEX IF NOT EXISTS idx_businesses_mpesa_shortcode_index ON businesses(mpesa_shortcode_index);

CREATE TABLE IF NOT EXISTS business_members (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL,
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    role        TEXT NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    invited_by  UUID REFERENCES auth_users(id),
    invited_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    joined_at   TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ,
    CONSTRAINT chk_business_member_role CHECK (role IN ('OWNER', 'MANAGER', 'CASHIER', 'VIEWER'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_business_members_business_user ON business_members(business_id, user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_business_members_user ON business_members(user_id);
CREATE INDEX IF NOT EXISTS idx_business_members_tenant ON business_members(tenant_id);

CREATE TABLE IF NOT EXISTS user_profiles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL,
    user_id     UUID NOT NULL UNIQUE REFERENCES auth_users(id) ON DELETE CASCADE,
    first_name  TEXT,
    last_name   TEXT,
    phone       TEXT,
    avatar_url  TEXT,
    timezone    TEXT NOT NULL DEFAULT 'Africa/Nairobi',
    language    TEXT NOT NULL DEFAULT 'en',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ
);
