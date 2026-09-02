-- Phase 1: Offline sync foundation — version counter + conflicts table
-- All syncable tables already use UUID PK and have updated_at/deleted_at. Add sync_version.

DO $$
BEGIN
  -- helper to add sync_version if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='sync_version') THEN
    ALTER TABLE products ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;
    CREATE INDEX IF NOT EXISTS idx_products_sync_version ON products(business_id, sync_version);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='product_variants' AND column_name='sync_version') THEN
    ALTER TABLE product_variants ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='sync_version') THEN
    ALTER TABLE customers ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;
    CREATE INDEX IF NOT EXISTS idx_customers_sync_version ON customers(business_id, sync_version);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_items' AND column_name='sync_version') THEN
    ALTER TABLE inventory_items ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock_movements' AND column_name='sync_version') THEN
    ALTER TABLE stock_movements ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='sync_version') THEN
    ALTER TABLE orders ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;
    CREATE INDEX IF NOT EXISTS idx_orders_sync_version ON orders(business_id, sync_version);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_lines' AND column_name='sync_version') THEN
    ALTER TABLE order_lines ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales' AND column_name='sync_version') THEN
    ALTER TABLE sales ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sale_lines' AND column_name='sync_version') THEN
    ALTER TABLE sale_lines ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='expenses' AND column_name='sync_version') THEN
    ALTER TABLE expenses ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;
    CREATE INDEX IF NOT EXISTS idx_expenses_sync_version ON expenses(business_id, sync_version);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='sync_version') THEN
    ALTER TABLE invoices ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;
    CREATE INDEX IF NOT EXISTS idx_invoices_sync_version ON invoices(business_id, sync_version);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoice_lines' AND column_name='sync_version') THEN
    ALTER TABLE invoice_lines ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;
  END IF;
  -- payments table does not exist in this schema (uses payment_commands) — only alter if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='payments') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='sync_version') THEN
      ALTER TABLE payments ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;
    END IF;
  END IF;
  -- payment_commands if exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='payment_commands') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_commands' AND column_name='sync_version') THEN
      ALTER TABLE payment_commands ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tax_rules' AND column_name='sync_version') THEN
    ALTER TABLE tax_rules ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;
  END IF;
END $$;

-- Conflicts table — explicit capture, never silent overwrite (§4)
CREATE TABLE IF NOT EXISTS conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  client_payload JSONB NOT NULL,
  server_payload JSONB NOT NULL,
  client_version INTEGER NOT NULL,
  server_version INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolution TEXT CHECK (resolution IN ('kept_client','kept_server','merged'))
);
CREATE INDEX IF NOT EXISTS idx_conflicts_business ON conflicts(business_id, table_name, resolved_at) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_conflicts_record ON conflicts(business_id, table_name, record_id);

-- Idempotency for push batches — reuse existing pattern but scope to sync
-- No new table: middleware already stores X-Idempotency-Key per business+key, we just wire it to /sync/push
