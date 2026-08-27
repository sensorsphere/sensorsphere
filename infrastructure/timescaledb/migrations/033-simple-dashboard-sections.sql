-- Ordered dashboard tabs and optional sections for simple metric dashboards.

CREATE TABLE IF NOT EXISTS simple_dashboard_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dashboard_id UUID NOT NULL REFERENCES simple_dashboards(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_simple_dashboard_sections_name_ci
    ON simple_dashboard_sections (dashboard_id, LOWER(name));

CREATE INDEX IF NOT EXISTS idx_simple_dashboard_sections_dashboard_order
    ON simple_dashboard_sections (dashboard_id, sort_order, created_at);

ALTER TABLE simple_dashboard_cards
    ADD COLUMN IF NOT EXISTS section_id UUID NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_simple_dashboard_cards_section'
    ) THEN
        ALTER TABLE simple_dashboard_cards
            ADD CONSTRAINT fk_simple_dashboard_cards_section
            FOREIGN KEY (section_id) REFERENCES simple_dashboard_sections(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_simple_dashboard_cards_section_order
    ON simple_dashboard_cards (dashboard_id, section_id, sort_order, created_at);
