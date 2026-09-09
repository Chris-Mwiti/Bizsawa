-- Fix: business_members / user_profiles incorrectly inherited BaseModel.SyncVersion
-- but 000002 never created that column and 000013 never added it → INSERT fails with SQLSTATE 42703.
-- Code fix moves them to TenantModel (no sync_version). This migration makes the DB idempotent
-- for any legacy binary still running: add the column if missing, or keep it for backward compat.
-- It is safe to run even after the code fix — new code simply ignores the column.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='business_members' AND column_name='sync_version') THEN
    ALTER TABLE business_members ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='sync_version') THEN
    ALTER TABLE user_profiles ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;
  END IF;
END $$;

-- Keep index only if column exists (no index needed for tenancy tables, but harmless)
-- No additional index: business_members is looked up by (business_id, user_id) already.
