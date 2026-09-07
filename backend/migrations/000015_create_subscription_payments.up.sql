CREATE TABLE IF NOT EXISTS subscription_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    plan_code TEXT NOT NULL,
    amount NUMERIC(18,2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'KES',
    phone TEXT NOT NULL,
    checkout_request_id TEXT,
    provider_receipt TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    failure_code TEXT,
    failure_message TEXT,
    account_reference TEXT,
    idempotency_key TEXT NOT NULL UNIQUE,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    result_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_user ON subscription_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_status ON subscription_payments(status);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_checkout ON subscription_payments(checkout_request_id);
