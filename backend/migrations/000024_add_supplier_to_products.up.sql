-- Product model gained a supplier field; the catalogue table was never
-- updated, so inserts failed with SQLSTATE 42703 (column does not exist).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'supplier'
  ) THEN
    ALTER TABLE products ADD COLUMN supplier TEXT;
  END IF;
END $$;
