import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ImportedTodo, PostgresProjectTodoRepository, TodoPriority, TodoRecord, TodoSectionRecord, TodoStatus } from "./repository.js";

const statusSchema = z.enum(["OPEN", "IN_PROGRESS", "DONE"]);
const prioritySchema = z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]);
const nullableText = z.string().trim().max(5000).nullable();

const sectionCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  sortOrder: z.number().int().optional()
}).strict();

const sectionUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  sortOrder: z.number().int().optional()
}).strict().refine(value => Object.keys(value).length > 0, "At least one field is required");

const taskCreateSchema = z.object({
  sectionId: z.string().uuid(),
  parentId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(1000),
  description: nullableText.optional(),
  status: statusSchema.optional(),
  priority: prioritySchema.optional(),
  component: z.string().trim().max(200).nullable().optional(),
  prReference: z.string().trim().max(200).nullable().optional(),
  patchReference: z.string().trim().max(500).nullable().optional(),
  sortOrder: z.number().int().optional()
}).strict();

const taskUpdateSchema = taskCreateSchema.partial().strict().refine(
  value => Object.keys(value).length > 0,
  "At least one field is required"
);

const importSchema = z.object({
  markdown: z.string().min(1).max(2_000_000),
  replace: z.boolean().default(true)
}).strict();

function mapSection(row: TodoSectionRecord) {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

function mapTask(row: TodoRecord) {
  return {
    id: row.id,
    sectionId: row.section_id,
    parentId: row.parent_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    component: row.component,
    prReference: row.pr_reference,
    patchReference: row.patch_reference,
    sortOrder: row.sort_order,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    completedAt: row.completed_at?.toISOString() ?? null
  };
}

function parseMarkdown(markdown: string): Array<{ name: string; tasks: ImportedTodo[] }> {
  const sections: Array<{ name: string; tasks: ImportedTodo[] }> = [];
  let current: { name: string; tasks: ImportedTodo[] } | null = null;
  const stack: Array<{ indent: number; task: ImportedTodo }> = [];

  for (const rawLine of markdown.split(/\r?\n/)) {
    const heading = rawLine.match(/^\s*(?:\*\*)?###\s+(.+?)(?:\*\*)?\s*$/);
    if (heading) {
      const name = heading[1]!.replace(/\*\*/g, "").trim();
      current = sections.find(section => section.name.toLowerCase() === name.toLowerCase()) ?? null;
      if (!current) {
        current = { name, tasks: [] };
        sections.push(current);
      }
      stack.length = 0;
      continue;
    }

    const match = rawLine.match(/^(\s*)[*-]\s+\[([Xx -])\]\s+(.+?)\s*$/);
    if (!match) continue;
    if (!current) {
      current = { name: "Imported", tasks: [] };
      sections.push(current);
    }

    const marker = match[2]!;
    const status: TodoStatus = marker === "-" ? "IN_PROGRESS" : /x/i.test(marker) ? "DONE" : "OPEN";
    const task: ImportedTodo = { title: match[3]!.trim(), status, children: [] };
    const indent = match[1]!.replace(/\t/g, "    ").length;

    while (stack.length > 0 && stack[stack.length - 1]!.indent >= indent) stack.pop();
    if (stack.length === 0) current.tasks.push(task);
    else stack[stack.length - 1]!.task.children.push(task);
    stack.push({ indent, task });
  }

  return sections.filter(section => section.tasks.length > 0 || section.name.length > 0);
}

function renderMarkdown(sections: TodoSectionRecord[], tasks: TodoRecord[]): string {
  const tasksByParent = new Map<string | null, TodoRecord[]>();
  for (const task of tasks) {
    const key = task.parent_id;
    const list = tasksByParent.get(key) ?? [];
    list.push(task);
    tasksByParent.set(key, list);
  }
  for (const list of tasksByParent.values()) {
    list.sort((a, b) => a.sort_order - b.sort_order || a.created_at.getTime() - b.created_at.getTime());
  }

  const lines: string[] = ["## Todos", ""];
  const marker = (status: TodoStatus) => status === "DONE" ? "X" : status === "IN_PROGRESS" ? "-" : " ";
  const append = (sectionId: string, parentId: string | null, depth: number) => {
    for (const task of (tasksByParent.get(parentId) ?? []).filter(item => item.section_id === sectionId)) {
      lines.push(`${"  ".repeat(depth)}* [${marker(task.status)}] ${task.title}`);
      append(sectionId, task.id, depth + 1);
    }
  };

  for (const section of sections) {
    lines.push(`### ${section.name}`, "");
    append(section.id, null, 0);
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export class ProjectTodoController {
  constructor(private readonly repository: PostgresProjectTodoRepository) {}

  list = async (_request: FastifyRequest, reply: FastifyReply) => {
    const [sections, tasks] = await Promise.all([this.repository.listSections(), this.repository.listTasks()]);
    const counts = { open: 0, inProgress: 0, done: 0, total: tasks.length };
    for (const task of tasks) {
      if (task.status === "OPEN") counts.open += 1;
      else if (task.status === "IN_PROGRESS") counts.inProgress += 1;
      else counts.done += 1;
    }
    return reply.send({
      sections: sections.map(mapSection),
      tasks: tasks.map(mapTask),
      summary: { ...counts, progressPercent: counts.total === 0 ? 0 : Math.round((counts.done / counts.total) * 100) }
    });
  };

  createSection = async (request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
    const parsed = sectionCreateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid section" });
    const sections = await this.repository.listSections();
    const section = await this.repository.createSection(parsed.data.name, parsed.data.sortOrder ?? sections.length);
    return reply.code(201).send(mapSection(section));
  };

  updateSection = async (request: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply: FastifyReply) => {
    const parsed = sectionUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid section" });
    const section = await this.repository.updateSection(request.params.id, parsed.data);
    if (!section) return reply.code(404).send({ error: "Section not found" });
    return reply.send(mapSection(section));
  };

  deleteSection = async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const deleted = await this.repository.deleteSection(request.params.id);
    if (!deleted) return reply.code(404).send({ error: "Section not found" });
    return reply.code(204).send();
  };

  createTask = async (request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
    const parsed = taskCreateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid task" });
    const task = await this.repository.createTask(parsed.data);
    return reply.code(201).send(mapTask(task));
  };

  updateTask = async (request: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply: FastifyReply) => {
    const parsed = taskUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid task" });
    const task = await this.repository.updateTask(request.params.id, parsed.data);
    if (!task) return reply.code(404).send({ error: "Task not found" });
    return reply.send(mapTask(task));
  };

  deleteTask = async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const deleted = await this.repository.deleteTask(request.params.id);
    if (!deleted) return reply.code(404).send({ error: "Task not found" });
    return reply.code(204).send();
  };

  exportMarkdown = async (_request: FastifyRequest, reply: FastifyReply) => {
    const [sections, tasks] = await Promise.all([this.repository.listSections(), this.repository.listTasks()]);
    return reply.type("text/markdown; charset=utf-8").send(renderMarkdown(sections, tasks));
  };

  importMarkdown = async (request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
    const parsed = importSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid import" });
    if (!parsed.data.replace) return reply.code(400).send({ error: "Only replace import is supported in this version" });
    const sections = parseMarkdown(parsed.data.markdown);
    if (sections.length === 0) return reply.code(400).send({ error: "No todo sections found in Markdown" });
    const imported = await this.repository.replaceAll(sections);
    return reply.send(imported);
  };
}
