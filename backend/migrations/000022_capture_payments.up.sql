-- Track 1: on-device M-Pesa SMS capture foundation.
-- captured_payments holds device-reported (unverified) and processor-verified
-- payment records. Verification states: device_reported -> verified (via
-- receipt+amount match against pesapal/daraja), disputed on amount mismatch.
-- QUARANTINE RULE: device_reported/disputed rows must NEVER feed sales
-- totals, analytics snapshots, insights or tax reports — only verified rows.
-- No outlet_id: no outlets entity exists yet (see discovery); deferred.

CREATE TABLE IF NOT EXISTS captured_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    source TEXT NOT NULL CHECK (source IN ('sms_device', 'manual', 'statement_import', 'pesapal', 'daraja')),
    verification_status TEXT NOT NULL DEFAULT 'device_reported'
        CHECK (verification_status IN ('device_reported', 'verified', 'disputed')),
    mpesa_receipt TEXT,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    currency TEXT NOT NULL DEFAULT 'KES',
    occurred_at TIMESTAMPTZ NOT NULL,
    channel_type TEXT NOT NULL DEFAULT 'unknown'
        CHECK (channel_type IN ('till', 'paybill', 'pochi', 'unknown')),
    payer_hash TEXT,
    parser_version TEXT,
    consent_version TEXT,
    device_id UUID,
    client_event_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    sync_version INTEGER NOT NULL DEFAULT 1
);
-- One logical payment per receipt per business; one client event per business.
CREATE UNIQUE INDEX IF NOT EXISTS idx_captured_payments_business_receipt
    ON captured_payments(business_id, mpesa_receipt)
    WHERE mpesa_receipt IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_captured_payments_business_event
    ON captured_payments(business_id, client_event_id)
    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_captured_payments_business_occurred
    ON captured_payments(business_id, occurred_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_captured_payments_business_status
    ON captured_payments(business_id, verification_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_captured_payments_business_source
    ON captured_payments(business_id, source) WHERE deleted_at IS NULL;

-- Capture devices: phones reporting SMS payments for a business.
CREATE TABLE IF NOT EXISTS capture_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    platform TEXT NOT NULL DEFAULT 'android',
    app_version TEXT,
    parser_version TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_capture_devices_business
    ON capture_devices(business_id) WHERE deleted_at IS NULL;

ALTER TABLE captured_payments
    ADD CONSTRAINT fk_captured_payments_device
    FOREIGN KEY (device_id) REFERENCES capture_devices(id) ON DELETE SET NULL;

-- Daraja credentials vault (Track 4 C2B linking). Columns only — no writers
-- yet. Values MUST be envelope-encrypted before any writer lands; never store
-- plaintext secrets here.
CREATE TABLE IF NOT EXISTS daraja_credentials (
    business_id UUID PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
    consumer_key_enc TEXT NOT NULL DEFAULT '',
    consumer_secret_enc TEXT NOT NULL DEFAULT '',
    till_number TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
