-- tax_entries records tax lines for sales/orders but was never added to the
-- sync_version backfill in 000013. taxes.Repository inserts sync_version (default)
-- so sales REST creation 500s in databases < this migration.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tax_entries' AND column_name='sync_version') THEN
    ALTER TABLE tax_entries ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;
  END IF;
END $$;