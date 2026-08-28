-- Dashboard templates and read-only metric instances.

CREATE TABLE IF NOT EXISTS simple_dashboard_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_simple_dashboard_templates_name_ci
    ON simple_dashboard_templates (LOWER(name));

CREATE TABLE IF NOT EXISTS simple_dashboard_template_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES simple_dashboard_templates(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_simple_dashboard_template_sections_name_ci
    ON simple_dashboard_template_sections (template_id, LOWER(name));

CREATE INDEX IF NOT EXISTS idx_simple_dashboard_template_sections_order
    ON simple_dashboard_template_sections (template_id, sort_order, created_at, id);

CREATE TABLE IF NOT EXISTS simple_dashboard_template_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES simple_dashboard_templates(id) ON DELETE CASCADE,
    section_id UUID NOT NULL REFERENCES simple_dashboard_template_sections(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (template_id, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_simple_dashboard_template_cards_order
    ON simple_dashboard_template_cards (template_id, section_id, sort_order, created_at, id);

ALTER TABLE simple_dashboards
    ADD COLUMN IF NOT EXISTS template_id UUID NULL REFERENCES simple_dashboard_templates(id) ON DELETE RESTRICT;

ALTER TABLE simple_dashboards
    ADD COLUMN IF NOT EXISTS template_metric_key TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_simple_dashboards_template_id
    ON simple_dashboards (template_id);
