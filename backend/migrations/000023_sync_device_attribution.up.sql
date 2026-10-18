-- Sync device attribution: who wrote what, for same-device last-write-wins.
-- Side table (one DDL, no per-table ALTERs): last writer device per record.
CREATE TABLE IF NOT EXISTS record_writers (
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  device_id TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (business_id, table_name, record_id)
);
CREATE INDEX IF NOT EXISTS idx_record_writers_device ON record_writers(business_id, device_id);

-- Conflicts carry both sides so the app can label "this device" vs "another device".
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='conflicts' AND column_name='client_device_id') THEN
    ALTER TABLE conflicts ADD COLUMN client_device_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='conflicts' AND column_name='server_device_id') THEN
    ALTER TABLE conflicts ADD COLUMN server_device_id TEXT;
  END IF;
END $$;

-- Audit trail for silent same-device last-write-wins applies. Unlike
-- conflicts, LWW applies resolve without user involvement, so each one is
-- recorded here with both versions for later forensics.
CREATE TABLE IF NOT EXISTS lww_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  device_id TEXT NOT NULL,
  client_version INTEGER NOT NULL,
  server_version INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lww_record ON lww_applications(business_id, table_name, record_id);
