-- Simple metric dashboards and ordered metric cards.

CREATE TABLE IF NOT EXISTS simple_dashboards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_simple_dashboards_name_ci
    ON simple_dashboards (LOWER(name));

CREATE TABLE IF NOT EXISTS simple_dashboard_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dashboard_id UUID NOT NULL REFERENCES simple_dashboards(id) ON DELETE CASCADE,
    asset_metric_id UUID NOT NULL REFERENCES asset_metrics(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (dashboard_id, asset_metric_id)
);

CREATE INDEX IF NOT EXISTS idx_simple_dashboard_cards_dashboard_order
    ON simple_dashboard_cards (dashboard_id, sort_order, created_at);
