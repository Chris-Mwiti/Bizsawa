-- Load-test findings F5/F6 (2026-10-07): sync/pull seq scans + invoice settle scan.
-- (business_id, updated_at) supports pullTable's
--   WHERE business_id = ? AND updated_at > ? AND deleted_at IS NULL
--   ORDER BY updated_at ASC LIMIT N
-- plus the deleted tombstone sweep on (business_id, deleted_at).
-- Tables without one of these columns are skipped via the DO blocks'
-- information_schema guards so the migration stays idempotent.

DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='updated_at') THEN CREATE INDEX IF NOT EXISTS idx_products_business_updated ON products(business_id, updated_at) WHERE deleted_at IS NULL; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='product_variants' AND column_name='updated_at') THEN CREATE INDEX IF NOT EXISTS idx_product_variants_business_updated ON product_variants(business_id, updated_at) WHERE deleted_at IS NULL; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='updated_at') THEN CREATE INDEX IF NOT EXISTS idx_customers_business_updated ON customers(business_id, updated_at) WHERE deleted_at IS NULL; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_items' AND column_name='updated_at') THEN CREATE INDEX IF NOT EXISTS idx_inventory_items_business_updated ON inventory_items(business_id, updated_at) WHERE deleted_at IS NULL; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock_movements' AND column_name='updated_at') THEN CREATE INDEX IF NOT EXISTS idx_stock_movements_business_updated ON stock_movements(business_id, updated_at) WHERE deleted_at IS NULL; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='updated_at') THEN CREATE INDEX IF NOT EXISTS idx_orders_business_updated ON orders(business_id, updated_at) WHERE deleted_at IS NULL; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_lines' AND column_name='updated_at') THEN CREATE INDEX IF NOT EXISTS idx_order_lines_business_updated ON order_lines(business_id, updated_at) WHERE deleted_at IS NULL; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales' AND column_name='updated_at') THEN CREATE INDEX IF NOT EXISTS idx_sales_business_updated ON sales(business_id, updated_at) WHERE deleted_at IS NULL; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sale_lines' AND column_name='updated_at') THEN CREATE INDEX IF NOT EXISTS idx_sale_lines_business_updated ON sale_lines(business_id, updated_at) WHERE deleted_at IS NULL; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='expenses' AND column_name='updated_at') THEN CREATE INDEX IF NOT EXISTS idx_expenses_business_updated ON expenses(business_id, updated_at) WHERE deleted_at IS NULL; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='updated_at') THEN CREATE INDEX IF NOT EXISTS idx_invoices_business_updated ON invoices(business_id, updated_at) WHERE deleted_at IS NULL; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoice_lines' AND column_name='updated_at') THEN CREATE INDEX IF NOT EXISTS idx_invoice_lines_business_updated ON invoice_lines(business_id, updated_at) WHERE deleted_at IS NULL; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_commands' AND column_name='updated_at') THEN CREATE INDEX IF NOT EXISTS idx_payment_commands_business_updated ON payment_commands(business_id, updated_at) WHERE deleted_at IS NULL; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tax_rules' AND column_name='updated_at') THEN CREATE INDEX IF NOT EXISTS idx_tax_rules_business_updated ON tax_rules(business_id, updated_at) WHERE deleted_at IS NULL; END IF; END $$;

-- F6: settle/history lookup
--   WHERE business_id = ? AND customer_id = ? AND status IN (...) AND amount_due > 0
--   ORDER BY due_at ASC NULLS LAST, created_at ASC
CREATE INDEX IF NOT EXISTS idx_invoices_settle ON invoices(business_id, customer_id, status, amount_due, due_at);
