CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE, customer_id UUID REFERENCES customers(id),
    invoice_number TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', subtotal NUMERIC(18,2) NOT NULL, tax_amount NUMERIC(18,2) NOT NULL, total NUMERIC(18,2) NOT NULL, amount_paid NUMERIC(18,2) NOT NULL DEFAULT 0, amount_due NUMERIC(18,2) NOT NULL, currency TEXT NOT NULL DEFAULT 'KES', notes TEXT,
    due_at TIMESTAMPTZ, sent_at TIMESTAMPTZ, viewed_at TIMESTAMPTZ, paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_business_number ON invoices(business_id, invoice_number) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_business_status ON invoices(business_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_due ON invoices(business_id, due_at);

CREATE TABLE IF NOT EXISTS invoice_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE, invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE, product_id UUID REFERENCES products(id),
    description TEXT NOT NULL, quantity NUMERIC(18,3) NOT NULL, unit_price NUMERIC(18,2) NOT NULL, line_total NUMERIC(18,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON invoice_lines(invoice_id);
