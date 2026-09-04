DROP INDEX IF EXISTS idx_sale_lines_variant;
ALTER TABLE sale_lines DROP COLUMN IF EXISTS product_variant_id;

DROP INDEX IF EXISTS idx_order_lines_variant;
ALTER TABLE order_lines DROP COLUMN IF EXISTS product_variant_id;
