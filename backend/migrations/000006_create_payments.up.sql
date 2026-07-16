CREATE TABLE IF NOT EXISTS payment_commands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE, invoice_id UUID REFERENCES invoices(id),
    type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', idempotency_key TEXT NOT NULL, amount NUMERIC(18,2) NOT NULL, currency TEXT NOT NULL DEFAULT 'KES', phone TEXT, account_reference TEXT, provider TEXT NOT NULL DEFAULT 'mpesa',
    provider_request_id TEXT, provider_receipt TEXT, failure_code TEXT, failure_message TEXT, payload JSONB NOT NULL DEFAULT '{}'::jsonb, result_payload JSONB, processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_business_idem ON payment_commands(business_id, idempotency_key) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payment_commands_status ON payment_commands(status, created_at);
CREATE INDEX IF NOT EXISTS idx_payment_commands_business_status ON payment_commands(business_id, status);
CREATE INDEX IF NOT EXISTS idx_payment_commands_provider_refs ON payment_commands(provider_request_id, provider_receipt);
