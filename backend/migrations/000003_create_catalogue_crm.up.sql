CREATE TABLE IF NOT EXISTS products (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL,
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT,
    sku         TEXT,
    category    TEXT,
    barcode     TEXT,
    image_url   TEXT,
    tax_rule_id UUID,
    price       NUMERIC(18,2) NOT NULL DEFAULT 0,
    cost        NUMERIC(18,2) NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_business ON products(business_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(business_id, category);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(business_id, barcode);
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_business_sku ON products(business_id, sku) WHERE deleted_at IS NULL AND sku <> '';

CREATE TABLE IF NOT EXISTS product_variants (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL,
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    sku         TEXT,
    barcode     TEXT,
    price       NUMERIC(18,2) NOT NULL DEFAULT 0,
    cost        NUMERIC(18,2) NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_product_variants_tenant ON product_variants(tenant_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_business ON product_variants(business_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_barcode ON product_variants(business_id, barcode);
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_variants_business_sku ON product_variants(business_id, sku) WHERE deleted_at IS NULL AND sku <> '';

CREATE TABLE IF NOT EXISTS customers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    phone           TEXT,
    email           TEXT,
    address         TEXT,
    tags            JSONB NOT NULL DEFAULT '[]'::jsonb,
    notes           TEXT,
    loyalty_points  INTEGER NOT NULL DEFAULT 0,
    total_spend     NUMERIC(18,2) NOT NULL DEFAULT 0,
    last_purchase_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_business ON customers(business_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(business_id, phone);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(business_id, email);
CREATE INDEX IF NOT EXISTS idx_customers_total_spend ON customers(business_id, total_spend DESC);
