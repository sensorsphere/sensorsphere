CREATE TABLE IF NOT EXISTS project_todo_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS project_todo_sections_name_uq
  ON project_todo_sections (LOWER(name));

CREATE INDEX IF NOT EXISTS project_todo_sections_sort_idx
  ON project_todo_sections (sort_order, name);

CREATE TABLE IF NOT EXISTS project_todos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES project_todo_sections(id) ON DELETE CASCADE,
  parent_id uuid NULL REFERENCES project_todos(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NULL,
  status text NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'IN_PROGRESS', 'DONE')),
  priority text NOT NULL DEFAULT 'NORMAL'
    CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'CRITICAL')),
  component text NULL,
  pr_reference text NULL,
  patch_reference text NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  completed_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS project_todos_section_sort_idx
  ON project_todos (section_id, parent_id, sort_order, created_at);

CREATE INDEX IF NOT EXISTS project_todos_status_idx
  ON project_todos (status);

CREATE INDEX IF NOT EXISTS project_todos_parent_idx
  ON project_todos (parent_id);
