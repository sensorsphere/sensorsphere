-- Materialize the implicit first dashboard section so every section can be renamed/deleted.

INSERT INTO simple_dashboard_sections (dashboard_id, name, sort_order)
SELECT d.id, 'General', -1
FROM simple_dashboards d
WHERE (
    NOT EXISTS (
        SELECT 1 FROM simple_dashboard_sections s WHERE s.dashboard_id = d.id
    )
    OR EXISTS (
        SELECT 1 FROM simple_dashboard_cards c
        WHERE c.dashboard_id = d.id AND c.section_id IS NULL
    )
)
AND NOT EXISTS (
    SELECT 1
    FROM simple_dashboard_sections s
    WHERE s.dashboard_id = d.id AND LOWER(s.name) = 'general'
);

UPDATE simple_dashboard_cards c
SET section_id = COALESCE(
    (
        SELECT s.id
        FROM simple_dashboard_sections s
        WHERE s.dashboard_id = c.dashboard_id AND LOWER(s.name) = 'general'
        ORDER BY s.sort_order, s.created_at, s.id
        LIMIT 1
    ),
    (
        SELECT s.id
        FROM simple_dashboard_sections s
        WHERE s.dashboard_id = c.dashboard_id
        ORDER BY s.sort_order, s.created_at, s.id
        LIMIT 1
    )
), updated_at = NOW()
WHERE c.section_id IS NULL;
