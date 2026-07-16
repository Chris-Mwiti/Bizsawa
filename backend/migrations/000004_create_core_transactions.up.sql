CREATE TABLE IF NOT EXISTS tax_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name TEXT NOT NULL, rate NUMERIC(8,4) NOT NULL, country TEXT NOT NULL DEFAULT 'KE', is_default BOOLEAN NOT NULL DEFAULT FALSE, is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_tax_rules_business ON tax_rules(business_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tax_rules_default ON tax_rules(business_id) WHERE is_default = TRUE AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS tax_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL, source_id UUID NOT NULL, tax_rule_id UUID REFERENCES tax_rules(id), tax_type TEXT NOT NULL, taxable NUMERIC(18,2) NOT NULL, amount NUMERIC(18,2) NOT NULL, occurred_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_tax_entries_business_period ON tax_entries(business_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_tax_entries_source ON tax_entries(source_type, source_id);

CREATE TABLE IF NOT EXISTS inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE, product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity NUMERIC(18,3) NOT NULL DEFAULT 0, low_stock_threshold NUMERIC(18,3) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_business_product ON inventory_items(business_id, product_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_low_stock ON inventory_items(business_id, quantity, low_stock_threshold);

CREATE TABLE IF NOT EXISTS stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE, product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity_delta NUMERIC(18,3) NOT NULL, movement_type TEXT NOT NULL, reference_type TEXT, reference_id UUID, notes TEXT, occurred_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_stock_movements_business_period ON stock_movements(business_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_reference ON stock_movements(reference_type, reference_id);

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE, customer_id UUID REFERENCES customers(id),
    status TEXT NOT NULL DEFAULT 'draft', subtotal NUMERIC(18,2) NOT NULL, tax_amount NUMERIC(18,2) NOT NULL, total NUMERIC(18,2) NOT NULL, payment_method TEXT NOT NULL DEFAULT 'cash', idempotency_key TEXT,
    confirmed_at TIMESTAMPTZ, fulfilled_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_orders_business_status ON orders(business_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_business_idem ON orders(business_id, idempotency_key) WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';

CREATE TABLE IF NOT EXISTS order_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE, order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE, product_id UUID NOT NULL REFERENCES products(id),
    quantity NUMERIC(18,3) NOT NULL, unit_price NUMERIC(18,2) NOT NULL, line_total NUMERIC(18,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_order_lines_order ON order_lines(order_id);

CREATE TABLE IF NOT EXISTS sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE, order_id UUID UNIQUE REFERENCES orders(id), customer_id UUID REFERENCES customers(id),
    receipt_number TEXT NOT NULL, staff_id UUID NOT NULL REFERENCES auth_users(id), payment_method TEXT NOT NULL, subtotal NUMERIC(18,2) NOT NULL, tax_amount NUMERIC(18,2) NOT NULL, total NUMERIC(18,2) NOT NULL, status TEXT NOT NULL DEFAULT 'completed', idempotency_key TEXT, sold_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_business_receipt ON sales(business_id, receipt_number) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_business_idem ON sales(business_id, idempotency_key) WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';
CREATE INDEX IF NOT EXISTS idx_sales_business_period ON sales(business_id, sold_at);

CREATE TABLE IF NOT EXISTS sale_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE, sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE, product_id UUID NOT NULL REFERENCES products(id),
    quantity NUMERIC(18,3) NOT NULL, unit_price NUMERIC(18,2) NOT NULL, line_total NUMERIC(18,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sale_lines_sale ON sale_lines(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_lines_product ON sale_lines(business_id, product_id);

CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    category TEXT NOT NULL, description TEXT, vendor TEXT, amount NUMERIC(18,2) NOT NULL, tax_amount NUMERIC(18,2) NOT NULL DEFAULT 0, is_recurring BOOLEAN NOT NULL DEFAULT FALSE, recurring_interval TEXT, spent_at TIMESTAMPTZ NOT NULL, created_by UUID REFERENCES auth_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_expenses_business_period ON expenses(business_id, spent_at);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(business_id, category);
