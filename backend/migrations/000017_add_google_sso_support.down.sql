DROP TABLE IF EXISTS auth_accounts;
ALTER TABLE auth_users DROP COLUMN IF EXISTS provider_account_id;
ALTER TABLE auth_users DROP COLUMN IF EXISTS provider;
ALTER TABLE auth_users DROP COLUMN IF EXISTS image;
ALTER TABLE auth_users DROP COLUMN IF EXISTS email_verified;
ALTER TABLE auth_users DROP COLUMN IF EXISTS name;
-- restore not null (will fail if nulls exist, but down is rarely used)
-- ALTER TABLE auth_users ALTER COLUMN password_hash SET NOT NULL;
