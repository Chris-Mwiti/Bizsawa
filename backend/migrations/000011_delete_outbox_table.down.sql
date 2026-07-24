-- 1. Re-create the outbox_events table matching your GORM model definitions
CREATE TABLE IF NOT EXISTS outbox_events (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL,
    aggregate_id   TEXT NOT NULL,
    aggregate_type TEXT NOT NULL,
    event_type     TEXT NOT NULL,
    stream         TEXT NOT NULL DEFAULT 'events',
    payload        JSONB NOT NULL,
    status         TEXT NOT NULL DEFAULT 'PENDING',
    attempts       INT NOT NULL DEFAULT 0,
    max_attempts   INT NOT NULL DEFAULT 5,
    scheduled_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at        TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Re-create the optimization indices for background worker execution loops
CREATE INDEX IF NOT EXISTS idx_outbox_events_tenant_id ON outbox_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_outbox_events_status ON outbox_events(status);
CREATE INDEX IF NOT EXISTS idx_outbox_events_scheduled_at ON outbox_events(scheduled_at);
