-- No-op down: keep columns for backward compat with legacy binaries.
-- If you truly want to revert the code fix, columns can be dropped manually:
-- ALTER TABLE business_members DROP COLUMN IF EXISTS sync_version;
-- ALTER TABLE user_profiles DROP COLUMN IF EXISTS sync_version;
SELECT 1;
