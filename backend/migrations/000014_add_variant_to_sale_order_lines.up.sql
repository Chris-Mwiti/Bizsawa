-- Add product_variant_id to sale_lines and order_lines for variant-aware sales
ALTER TABLE sale_lines
  ADD COLUMN IF NOT EXISTS product_variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sale_lines_variant ON sale_lines(product_variant_id) WHERE product_variant_id IS NOT NULL;

ALTER TABLE order_lines
  ADD COLUMN IF NOT EXISTS product_variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_order_lines_variant ON order_lines(product_variant_id) WHERE product_variant_id IS NOT NULL;
