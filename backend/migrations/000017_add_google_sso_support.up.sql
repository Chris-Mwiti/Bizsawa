-- Better-Auth parity + backend auth architecture integration for Google SSO
-- See Agents_Documents/BetterAuth/GoogleSocialLogin.md (baseURL, clientIds, hd, prompt, accessType)

-- 1. Make password_hash nullable for SSO users (credential users still have hash)
ALTER TABLE auth_users ALTER COLUMN password_hash DROP NOT NULL;

-- 2. Add better-auth user fields (image, emailVerified) + provider tracking
ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS image TEXT;
ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'credential';
ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS provider_account_id TEXT;
ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS name TEXT;
CREATE INDEX IF NOT EXISTS idx_auth_users_provider_account ON auth_users(provider, provider_account_id) WHERE provider_account_id IS NOT NULL;

-- 3. auth_accounts mirrors better-auth account table (linked social accounts)
CREATE TABLE IF NOT EXISTS auth_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL, -- 'google' | 'credential'
    provider_account_id TEXT NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    id_token TEXT,
    expires_at TIMESTAMPTZ,
    scope TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_auth_accounts_provider_account UNIQUE (provider, provider_account_id)
);
CREATE INDEX IF NOT EXISTS idx_auth_accounts_user ON auth_accounts(user_id);
