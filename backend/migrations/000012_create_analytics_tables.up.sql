CREATE TABLE IF NOT EXISTS analytics_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    timeframe TEXT NOT NULL,
    payload JSONB NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_lookup ON analytics_snapshots(business_id, timeframe, generated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_snapshots_business_timeframe ON analytics_snapshots(business_id, timeframe)
    WHERE timeframe IN ('day', 'week', 'month', 'year');