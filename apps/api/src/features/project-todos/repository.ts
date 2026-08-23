import type { Pool, PoolClient } from "pg";

export type TodoStatus = "OPEN" | "IN_PROGRESS" | "DONE";
export type TodoPriority = "LOW" | "NORMAL" | "HIGH" | "CRITICAL";

export interface TodoSectionRecord {
  id: string;
  name: string;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface TodoRecord {
  id: string;
  section_id: string;
  parent_id: string | null;
  title: string;
  description: string | null;
  status: TodoStatus;
  priority: TodoPriority;
  component: string | null;
  pr_reference: string | null;
  patch_reference: string | null;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
}

export interface CreateTodoInput {
  sectionId: string;
  parentId?: string | null;
  title: string;
  description?: string | null;
  status?: TodoStatus;
  priority?: TodoPriority;
  component?: string | null;
  prReference?: string | null;
  patchReference?: string | null;
  sortOrder?: number;
}

export interface UpdateTodoInput {
  sectionId?: string;
  parentId?: string | null;
  title?: string;
  description?: string | null;
  status?: TodoStatus;
  priority?: TodoPriority;
  component?: string | null;
  prReference?: string | null;
  patchReference?: string | null;
  sortOrder?: number;
}

export class PostgresProjectTodoRepository {
  constructor(private readonly pool: Pool) {}

  async listSections(): Promise<TodoSectionRecord[]> {
    const result = await this.pool.query<TodoSectionRecord>(`
      SELECT id, name, sort_order, created_at, updated_at
      FROM project_todo_sections
      ORDER BY sort_order, LOWER(name), id
    `);
    return result.rows;
  }

  async listTasks(): Promise<TodoRecord[]> {
    const result = await this.pool.query<TodoRecord>(`
      SELECT
        id, section_id, parent_id, title, description, status, priority,
        component, pr_reference, patch_reference, sort_order,
        created_at, updated_at, completed_at
      FROM project_todos
      ORDER BY sort_order, created_at, id
    `);
    return result.rows;
  }

  async createSection(name: string, sortOrder: number): Promise<TodoSectionRecord> {
    const result = await this.pool.query<TodoSectionRecord>(`
      INSERT INTO project_todo_sections (name, sort_order)
      VALUES ($1, $2)
      RETURNING id, name, sort_order, created_at, updated_at
    `, [name, sortOrder]);
    return result.rows[0]!;
  }

  async updateSection(id: string, input: { name?: string; sortOrder?: number }): Promise<TodoSectionRecord | null> {
    const result = await this.pool.query<TodoSectionRecord>(`
      UPDATE project_todo_sections
      SET
        name = COALESCE($2, name),
        sort_order = COALESCE($3, sort_order),
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, name, sort_order, created_at, updated_at
    `, [id, input.name ?? null, input.sortOrder ?? null]);
    return result.rows[0] ?? null;
  }

  async deleteSection(id: string): Promise<boolean> {
    const result = await this.pool.query(`DELETE FROM project_todo_sections WHERE id = $1`, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async createTask(input: CreateTodoInput): Promise<TodoRecord> {
    const status = input.status ?? "OPEN";
    const result = await this.pool.query<TodoRecord>(`
      INSERT INTO project_todos (
        section_id, parent_id, title, description, status, priority,
        component, pr_reference, patch_reference, sort_order, completed_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CASE WHEN $5 = 'DONE' THEN NOW() ELSE NULL END)
      RETURNING
        id, section_id, parent_id, title, description, status, priority,
        component, pr_reference, patch_reference, sort_order,
        created_at, updated_at, completed_at
    `, [
      input.sectionId,
      input.parentId ?? null,
      input.title,
      input.description ?? null,
      status,
      input.priority ?? "NORMAL",
      input.component ?? null,
      input.prReference ?? null,
      input.patchReference ?? null,
      input.sortOrder ?? 0
    ]);
    return result.rows[0]!;
  }

  async updateTask(id: string, input: UpdateTodoInput): Promise<TodoRecord | null> {
    const result = await this.pool.query<TodoRecord>(`
      UPDATE project_todos
      SET
        section_id = COALESCE($2, section_id),
        parent_id = CASE WHEN $3 THEN $4 ELSE parent_id END,
        title = COALESCE($5, title),
        description = CASE WHEN $6 THEN $7 ELSE description END,
        status = COALESCE($8, status),
        priority = COALESCE($9, priority),
        component = CASE WHEN $10 THEN $11 ELSE component END,
        pr_reference = CASE WHEN $12 THEN $13 ELSE pr_reference END,
        patch_reference = CASE WHEN $14 THEN $15 ELSE patch_reference END,
        sort_order = COALESCE($16, sort_order),
        completed_at = CASE
          WHEN $8 = 'DONE' AND status <> 'DONE' THEN NOW()
          WHEN $8 IS NOT NULL AND $8 <> 'DONE' THEN NULL
          ELSE completed_at
        END,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id, section_id, parent_id, title, description, status, priority,
        component, pr_reference, patch_reference, sort_order,
        created_at, updated_at, completed_at
    `, [
      id,
      input.sectionId ?? null,
      Object.prototype.hasOwnProperty.call(input, "parentId"), input.parentId ?? null,
      input.title ?? null,
      Object.prototype.hasOwnProperty.call(input, "description"), input.description ?? null,
      input.status ?? null,
      input.priority ?? null,
      Object.prototype.hasOwnProperty.call(input, "component"), input.component ?? null,
      Object.prototype.hasOwnProperty.call(input, "prReference"), input.prReference ?? null,
      Object.prototype.hasOwnProperty.call(input, "patchReference"), input.patchReference ?? null,
      input.sortOrder ?? null
    ]);
    return result.rows[0] ?? null;
  }

  async deleteTask(id: string): Promise<boolean> {
    const result = await this.pool.query(`DELETE FROM project_todos WHERE id = $1`, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async replaceAll(sections: Array<{ name: string; tasks: ImportedTodo[] }>): Promise<{ sections: number; tasks: number }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM project_todo_sections");
      const counters = { sections: 0, tasks: 0 };
      for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
        const section = sections[sectionIndex]!;
        const sectionResult = await client.query<{ id: string }>(`
          INSERT INTO project_todo_sections (name, sort_order)
          VALUES ($1, $2)
          RETURNING id
        `, [section.name, sectionIndex]);
        counters.sections += 1;
        await this.insertImportedTasks(client, sectionResult.rows[0]!.id, null, section.tasks, counters);
      }
      await client.query("COMMIT");
      return counters;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async insertImportedTasks(
    client: PoolClient,
    sectionId: string,
    parentId: string | null,
    tasks: ImportedTodo[],
    counters: { sections: number; tasks: number }
  ): Promise<void> {
    for (let index = 0; index < tasks.length; index += 1) {
      const task = tasks[index]!;
      const result = await client.query<{ id: string }>(`
        INSERT INTO project_todos (
          section_id, parent_id, title, status, priority, sort_order, completed_at
        )
        VALUES ($1,$2,$3,$4,'NORMAL',$5,CASE WHEN $4 = 'DONE' THEN NOW() ELSE NULL END)
        RETURNING id
      `, [sectionId, parentId, task.title, task.status, index]);
      counters.tasks += 1;
      await this.insertImportedTasks(client, sectionId, result.rows[0]!.id, task.children, counters);
    }
  }
}

export interface ImportedTodo {
  title: string;
  status: TodoStatus;
  children: ImportedTodo[];
}
