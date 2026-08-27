import React from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Menu,
  Modal,
  Progress,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import {
  createProjectTodo,
  createProjectTodoSection,
  deleteProjectTodo,
  deleteProjectTodoSection,
  exportProjectTodosMarkdown,
  getProjectTodos,
  importProjectTodosMarkdown,
  updateProjectTodo,
  updateProjectTodoSection
} from "./api";
import { BadgeSelect } from "./BadgeSelect";
import { NavigationIcon } from "./NavigationIcon";
import { ResetFiltersAction } from "./ResetFiltersAction";
import { activeFilterStyles } from "./filterStyles";
import type {
  CreateProjectTodoInput,
  ProjectTodo,
  ProjectTodoPriority,
  ProjectTodoSection,
  ProjectTodoStatus
} from "./types";
import { usePersistentState } from "./preferences/usePersistentState";

const STATUS_OPTIONS = [
  { value: "OPEN", label: "OPEN" },
  { value: "IN_PROGRESS", label: "IN PROGRESS" },
  { value: "DONE", label: "DONE" }
];
const PRIORITY_OPTIONS = [
  { value: "LOW", label: "LOW" },
  { value: "NORMAL", label: "NORMAL" },
  { value: "HIGH", label: "HIGH" },
  { value: "CRITICAL", label: "CRITICAL" }
];
const STATUS_ORDER: ProjectTodoStatus[] = ["OPEN", "IN_PROGRESS", "DONE"];
const SECTION_COLORS = [
  "blue", "violet", "grape", "pink", "orange", "yellow",
  "lime", "green", "teal", "cyan", "indigo", "red"
];

const sectionColor = (sectionId: string, sections: ProjectTodoSection[]) => {
  const index = Math.max(0, sections.findIndex(section => section.id === sectionId));
  return SECTION_COLORS[index % SECTION_COLORS.length];
};

const sectionAccent = (color: string) => `var(--mantine-color-${color}-6)`;

const taskPromptText = (task: ProjectTodo, section: ProjectTodoSection) => [
  `${section.name}:`,
  `Title: ${task.title}`,
  `Description: ${task.description?.trim() || "-"}`,
  task.component ? `Component: ${task.component}` : null,
  task.prReference ? `PR: ${task.prReference}` : null,
  task.patchReference ? `Patch: ${task.patchReference}` : null
].filter(Boolean).join("\n");

async function writeClipboardText(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall back for browsers/HTTP contexts where Clipboard API is unavailable or denied.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) throw new Error("Clipboard copy failed");
}

const statusColor = (status: ProjectTodoStatus) =>
  status === "DONE" ? "green" : status === "IN_PROGRESS" ? "blue" : "gray";
const priorityColor = (priority: ProjectTodoPriority) =>
  priority === "CRITICAL" ? "red" : priority === "HIGH" ? "orange" : priority === "LOW" ? "gray" : "blue";

function sectionStats(sectionId: string, tasks: ProjectTodo[]) {
  const rows = tasks.filter(task => task.sectionId === sectionId);
  const done = rows.filter(task => task.status === "DONE").length;
  return { done, total: rows.length };
}

function TaskRow({
  task,
  depth,
  section,
  tasks,
  onEdit,
  onAddSubtask,
  onRefresh,
  onMove,
  onCopyPrompt,
  onAdvanceStatus
}: {
  task: ProjectTodo;
  depth: number;
  section: ProjectTodoSection;
  tasks: ProjectTodo[];
  onEdit: (task: ProjectTodo) => void;
  onAddSubtask: (task: ProjectTodo) => void;
  onRefresh: () => Promise<unknown>;
  onMove: (task: ProjectTodo, direction: -1 | 1) => Promise<void>;
  onCopyPrompt: (task: ProjectTodo, section: ProjectTodoSection) => Promise<void>;
  onAdvanceStatus: (task: ProjectTodo) => Promise<void>;
}) {
  const children = tasks
    .filter(candidate => candidate.parentId === task.id)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));

  const setStatus = async (status: ProjectTodoStatus) => {
    await updateProjectTodo(task.id, { status });
    await onRefresh();
  };


  return (
    <>
      <Card withBorder padding="sm" ml={depth * 24}>
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Group gap="sm" align="flex-start" style={{ minWidth: 0, flex: 1 }}>
            <Checkbox
              mt={3}
              checked={task.status === "DONE"}
              indeterminate={task.status === "IN_PROGRESS"}
              onChange={() => setStatus(task.status === "DONE" ? "OPEN" : "DONE")}
              aria-label={`Toggle ${task.title}`}
            />
            <Stack gap={4} style={{ minWidth: 0, flex: 1 }}>
              <Group gap="xs">
                <Text fw={600} td={task.status === "DONE" ? "line-through" : undefined}>
                  {task.title}
                </Text>
                <Badge
                  size="sm"
                  color={statusColor(task.status)}
                  style={{ cursor: task.status === "DONE" ? "default" : "pointer" }}
                  title={task.status === "DONE" ? "Task is done" : "Advance status"}
                  onClick={() => { if (task.status !== "DONE") void onAdvanceStatus(task); }}
                >
                  {task.status.replace("_", " ")}
                </Badge>
                <Badge size="sm" variant="light" color={priorityColor(task.priority)}>{task.priority}</Badge>
                {task.component && <Badge size="sm" variant="outline">{task.component}</Badge>}
                {task.prReference && <Badge size="sm" variant="outline" color="violet">{task.prReference}</Badge>}
              </Group>
              {task.description && <Text size="sm" c="dimmed" style={{ whiteSpace: "pre-wrap" }}>{task.description}</Text>}
              {task.patchReference && <Text size="xs" c="dimmed">Patch: {task.patchReference}</Text>}
            </Stack>
          </Group>
          <Group gap={4} wrap="nowrap">
            <ActionIcon variant="subtle" title="Move up" onClick={() => onMove(task, -1)}>↑</ActionIcon>
            <ActionIcon variant="subtle" title="Move down" onClick={() => onMove(task, 1)}>↓</ActionIcon>
            {task.status !== "IN_PROGRESS" && (
              <ActionIcon variant="subtle" color="blue" title="Mark in progress" onClick={() => setStatus("IN_PROGRESS")}>◐</ActionIcon>
            )}
            <ActionIcon variant="subtle" title="Add subtask" onClick={() => onAddSubtask(task)}>＋</ActionIcon>
            <ActionIcon variant="subtle" title="Copy as prompt" onClick={() => onCopyPrompt(task, section)}>⧉</ActionIcon>
            <ActionIcon variant="subtle" title="Edit" onClick={() => onEdit(task)}>✎</ActionIcon>
            <ActionIcon
              variant="subtle"
              color="red"
              title="Delete"
              onClick={async () => {
                if (!window.confirm(`Delete task "${task.title}" and its subtasks?`)) return;
                await deleteProjectTodo(task.id);
                await onRefresh();
              }}
            >🗑</ActionIcon>
          </Group>
        </Group>
      </Card>
      {children.map(child => (
        <TaskRow
          key={child.id}
          task={child}
          depth={depth + 1}
          section={section}
          tasks={tasks}
          onEdit={onEdit}
          onAddSubtask={onAddSubtask}
          onRefresh={onRefresh}
          onMove={onMove}
          onCopyPrompt={onCopyPrompt}
          onAdvanceStatus={onAdvanceStatus}
        />
      ))}
    </>
  );
}

export function ProjectTodosPanel() {
  const query = useQuery({
    queryKey: ["project-todos"],
    queryFn: getProjectTodos
  });
  const [view, setView] = usePersistentState<"list" | "board">(
    "projectTodos.view", "list", value => value === "list" || value === "board"
  );
  const [search, setSearch] = usePersistentState<string>(
    "projectTodos.filter.search", "", value => typeof value === "string"
  );
  const [statusFilter, setStatusFilter] = usePersistentState<string[]>(
    "projectTodos.filter.status", [], value =>
      Array.isArray(value) && value.every(item => STATUS_OPTIONS.some(option => option.value === item))
  );
  const [priorityFilter, setPriorityFilter] = usePersistentState<string | null>(
    "projectTodos.filter.priority", null, value => value === null || PRIORITY_OPTIONS.some(option => option.value === value)
  );
  const [sectionFilter, setSectionFilter] = usePersistentState<string[]>(
    "projectTodos.filter.section", [], value => Array.isArray(value) && value.every(item => typeof item === "string")
  );
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
  const [taskModalOpen, setTaskModalOpen] = React.useState(false);
  const [sectionModalOpen, setSectionModalOpen] = React.useState(false);
  const [importModalOpen, setImportModalOpen] = React.useState(false);
  const [editingTask, setEditingTask] = React.useState<ProjectTodo | null>(null);
  const [editingSection, setEditingSection] = React.useState<ProjectTodoSection | null>(null);
  const [newParentId, setNewParentId] = React.useState<string | null>(null);
  const [taskForm, setTaskForm] = React.useState<CreateProjectTodoInput>({
    sectionId: "", title: "", status: "OPEN", priority: "NORMAL"
  });
  const [sectionName, setSectionName] = React.useState("");
  const [importMarkdown, setImportMarkdown] = React.useState("");
  const [message, setMessage] = React.useState<string | null>(null);
  const [copyToast, setCopyToast] = React.useState<{ text: string; error?: boolean } | null>(null);
  const [draggedTaskId, setDraggedTaskId] = React.useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = React.useState<ProjectTodoStatus | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = React.useState<string | null>(null);

  const data = query.data;
  const sections = data?.sections ?? [];
  const sortedSections = React.useMemo(
    () => [...sections].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [sections]
  );
  const tasks = data?.tasks ?? [];
  const refresh = React.useCallback(async () => query.refetch(), [query.refetch]);

  const showCopyToast = React.useCallback((text: string, error = false) => {
    setCopyToast({ text, error });
    window.setTimeout(() => {
      setCopyToast(current => current?.text === text ? null : current);
    }, 2600);
  }, []);

  const copyPrompt = React.useCallback(async (task: ProjectTodo, section: ProjectTodoSection) => {
    try {
      await writeClipboardText(taskPromptText(task, section));
      showCopyToast(`Prompt copied: ${task.title}`);
    } catch {
      showCopyToast(`Unable to copy prompt: ${task.title}`, true);
    }
  }, [showCopyToast]);

  const advanceTaskStatus = React.useCallback(async (task: ProjectTodo) => {
    const currentIndex = STATUS_ORDER.indexOf(task.status);
    const nextStatus = STATUS_ORDER[currentIndex + 1];
    if (!nextStatus) return;
    await updateProjectTodo(task.id, { status: nextStatus });
    setCopyToast({ text: `Status changed to ${nextStatus.replace("_", " ")}` });
    window.setTimeout(() => {
      setCopyToast(current => current?.text === `Status changed to ${nextStatus.replace("_", " ")}` ? null : current);
    }, 2600);
    await refresh();
  }, [refresh]);

  const moveTask = async (task: ProjectTodo, direction: -1 | 1) => {
    const siblings = tasks
      .filter(candidate => candidate.sectionId === task.sectionId && candidate.parentId === task.parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
    const index = siblings.findIndex(candidate => candidate.id === task.id);
    const target = siblings[index + direction];
    if (!target) return;
    await Promise.all([
      updateProjectTodo(task.id, { sortOrder: target.sortOrder }),
      updateProjectTodo(target.id, { sortOrder: task.sortOrder })
    ]);
    await refresh();
  };

  const openNewTask = (sectionId?: string, parentId?: string | null) => {
    const targetSection = sectionId ?? sectionFilter[0] ?? sortedSections[0]?.id ?? "";
    setEditingTask(null);
    setNewParentId(parentId ?? null);
    setTaskForm({
      sectionId: targetSection,
      parentId: parentId ?? null,
      title: "",
      description: null,
      status: "OPEN",
      priority: "NORMAL",
      component: null,
      prReference: null,
      patchReference: null
    });
    setTaskModalOpen(true);
  };

  const openEditTask = (task: ProjectTodo) => {
    setEditingTask(task);
    setNewParentId(task.parentId);
    setTaskForm({
      sectionId: task.sectionId,
      parentId: task.parentId,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      component: task.component,
      prReference: task.prReference,
      patchReference: task.patchReference,
      sortOrder: task.sortOrder
    });
    setTaskModalOpen(true);
  };

  const filteredTasks = tasks.filter(task => {
    const haystack = [task.title, task.description, task.component, task.prReference, task.patchReference]
      .filter(Boolean).join(" ").toLowerCase();
    return (!search.trim() || haystack.includes(search.trim().toLowerCase())) &&
      (statusFilter.length === 0 || statusFilter.includes(task.status)) &&
      (!priorityFilter || task.priority === priorityFilter) &&
      (sectionFilter.length === 0 || sectionFilter.includes(task.sectionId));
  });
  const filteredIds = new Set(filteredTasks.map(task => task.id));
  const rootTasksForSection = (sectionId: string) => tasks
    .filter(task => task.sectionId === sectionId && task.parentId === null)
    .filter(task => filteredIds.has(task.id) || tasks.some(child => child.parentId === task.id && filteredIds.has(child.id)))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));

  const resetFilters = () => {
    setSearch("");
    setStatusFilter([]);
    setPriorityFilter(null);
    setSectionFilter([]);
  };

  const boardRows = (status: ProjectTodoStatus) => filteredTasks
    .filter(task => task.status === status)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));

  const completeBoardDrop = async (targetStatus: ProjectTodoStatus, targetTaskId?: string | null) => {
    if (!draggedTaskId) return;
    const dragged = tasks.find(task => task.id === draggedTaskId);
    if (!dragged) return;

    const target = targetTaskId ? tasks.find(task => task.id === targetTaskId) : null;
    const updates: Array<Promise<ProjectTodo>> = [];

    if (target && target.id !== dragged.id) {
      const sameSiblingScope = target.sectionId === dragged.sectionId && target.parentId === dragged.parentId;
      if (sameSiblingScope) {
        updates.push(updateProjectTodo(dragged.id, { status: targetStatus, sortOrder: target.sortOrder }));
        updates.push(updateProjectTodo(target.id, { sortOrder: dragged.sortOrder }));
      } else {
        updates.push(updateProjectTodo(dragged.id, { status: targetStatus, sortOrder: target.sortOrder }));
      }
    } else {
      const targetRows = tasks.filter(task => task.status === targetStatus && task.id !== dragged.id);
      const lastSortOrder = targetRows.reduce((max, task) => Math.max(max, task.sortOrder), -1);
      updates.push(updateProjectTodo(dragged.id, { status: targetStatus, sortOrder: lastSortOrder + 1 }));
    }

    await Promise.all(updates);
    setDraggedTaskId(null);
    setDragOverStatus(null);
    setDragOverTaskId(null);
    await refresh();
  };

  const moveBoardTaskByStatus = async (task: ProjectTodo, direction: -1 | 1) => {
    const currentIndex = STATUS_ORDER.indexOf(task.status);
    const nextStatus = STATUS_ORDER[currentIndex + direction];
    if (!nextStatus) return;
    const targetRows = tasks.filter(candidate => candidate.status === nextStatus && candidate.id !== task.id);
    const lastSortOrder = targetRows.reduce((max, candidate) => Math.max(max, candidate.sortOrder), -1);
    await updateProjectTodo(task.id, { status: nextStatus, sortOrder: lastSortOrder + 1 });
    await refresh();
  };

  const copyBoardPrompt = async (task: ProjectTodo) => {
    const section = sections.find(item => item.id === task.sectionId);
    if (!section) return;
    await copyPrompt(task, section);
  };

  const filtersActive = Boolean(search.trim() || statusFilter.length > 0 || priorityFilter || sectionFilter.length > 0);

  const saveTask = React.useCallback(async () => {
    if (!taskForm.title.trim() || !taskForm.sectionId) return;
    if (editingTask) await updateProjectTodo(editingTask.id, taskForm);
    else await createProjectTodo(taskForm);
    setTaskModalOpen(false);
    await refresh();
  }, [editingTask, taskForm, refresh]);

  React.useEffect(() => {
    if (!taskModalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      void saveTask();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [taskModalOpen, saveTask]);

  if (query.isLoading) return <Text>Loading project todos…</Text>;
  if (query.error) return <Text c="red">{query.error instanceof Error ? query.error.message : "Unable to load todos"}</Text>;

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start">
        <div>
          <Group gap="xs">
            <NavigationIcon page="todos" size={24} />
            <Title order={2}>Project Todos</Title>
          </Group>
          <Text c="dimmed">Lightweight project tracking with Markdown portability</Text>
        </div>
        <Group gap="xs">
          <Button variant="light" onClick={() => { setImportMarkdown(""); setImportModalOpen(true); }}>Import Markdown</Button>
          <Button
            variant="light"
            onClick={async () => {
              const markdown = await exportProjectTodosMarkdown();
              const blob = new Blob([markdown], { type: "text/markdown" });
              const url = URL.createObjectURL(blob);
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = "sensorsphere-todos.md";
              anchor.click();
              URL.revokeObjectURL(url);
            }}
          >Export Markdown</Button>
          <Button onClick={() => openNewTask()}>+ New task</Button>
        </Group>
      </Group>

      {message && <Card withBorder padding="xs"><Text size="sm">{message}</Text></Card>}

      {copyToast && (
        <Card
          withBorder
          padding="sm"
          shadow="md"
          style={{
            position: "fixed",
            right: 20,
            bottom: 20,
            zIndex: 10000,
            borderColor: copyToast.error ? "var(--mantine-color-red-6)" : "var(--mantine-color-green-6)"
          }}
        >
          <Group gap="xs" wrap="nowrap">
            <Text c={copyToast.error ? "red" : "green"}>{copyToast.error ? "✕" : "✓"}</Text>
            <Text size="sm" fw={600}>{copyToast.text}</Text>
          </Group>
        </Card>
      )}

      <SimpleGrid cols={{ base: 2, md: 4 }}>
        <Card withBorder style={{ borderLeft: `4px solid var(--mantine-color-${statusColor("OPEN")}-6)` }}>
          <Badge size="sm" variant="light" color={statusColor("OPEN")}>OPEN</Badge>
          <Text size="xl" fw={700} c={statusColor("OPEN")}>{data?.summary.open ?? 0}</Text>
        </Card>
        <Card withBorder style={{ borderLeft: `4px solid var(--mantine-color-${statusColor("IN_PROGRESS")}-6)` }}>
          <Badge size="sm" variant="light" color={statusColor("IN_PROGRESS")}>IN PROGRESS</Badge>
          <Text size="xl" fw={700} c={statusColor("IN_PROGRESS")}>{data?.summary.inProgress ?? 0}</Text>
        </Card>
        <Card withBorder style={{ borderLeft: `4px solid var(--mantine-color-${statusColor("DONE")}-6)` }}>
          <Badge size="sm" variant="light" color={statusColor("DONE")}>COMPLETED</Badge>
          <Text size="xl" fw={700} c={statusColor("DONE")}>{data?.summary.done ?? 0}</Text>
        </Card>
        <Card withBorder>
          <Group justify="space-between"><Text size="xs" c="dimmed">PROGRESS</Text><Text fw={700}>{data?.summary.progressPercent ?? 0}%</Text></Group>
          <Progress mt="xs" color="violet" value={data?.summary.progressPercent ?? 0} />
        </Card>
      </SimpleGrid>

      <Card withBorder padding="sm">
        <Group justify="space-between" align="flex-end">
          <Group align="flex-end">
            <TextInput
              label="Search"
              placeholder="Task, PR, patch, component…"
              value={search}
              onChange={event => setSearch(event.currentTarget.value)}
              styles={activeFilterStyles(Boolean(search.trim()))}
              rightSection={search.trim() ? (
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  aria-label="Clear search filter"
                  title="Clear search filter"
                  onClick={() => setSearch("")}
                >×</ActionIcon>
              ) : undefined}
            />
            <Stack gap={4}>
              <Text size="sm" fw={500}>Status</Text>
              <Menu closeOnItemClick={false} withinPortal position="bottom-start">
                <Menu.Target>
                  <Button
                    variant="light"
                    color="gray"
                    justify="flex-start"
                    style={{
                      minWidth: 210,
                      border: statusFilter.length > 0 ? "2px solid var(--mantine-color-blue-6)" : undefined
                    }}
                  >
                    {statusFilter.length === 0 ? (
                      <Text size="sm" c="dimmed">All statuses</Text>
                    ) : (
                      <Group gap={4} wrap="wrap">
                        {statusFilter.map(status => (
                          <Badge
                            key={status}
                            size="sm"
                            variant="light"
                            color={statusColor(status as ProjectTodoStatus)}
                            rightSection={
                              <span
                                role="button"
                                aria-label={`Remove ${status.replace("_", " ")} filter`}
                                title="Remove filter"
                                style={{ cursor: "pointer", fontWeight: 700 }}
                                onMouseDown={event => event.preventDefault()}
                                onClick={event => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  setStatusFilter(current => current.filter(value => value !== status));
                                }}
                              >×</span>
                            }
                          >
                            {status.replace("_", " ")}
                          </Badge>
                        ))}
                      </Group>
                    )}
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  {STATUS_OPTIONS.map(option => {
                    const checked = statusFilter.includes(option.value);
                    return (
                      <Menu.Item
                        key={option.value}
                        onClick={() => setStatusFilter(current =>
                          current.includes(option.value)
                            ? current.filter(value => value !== option.value)
                            : [...current, option.value]
                        )}
                      >
                        <Group gap="xs" wrap="nowrap">
                          <Checkbox checked={checked} readOnly size="xs" tabIndex={-1} />
                          <Badge size="sm" variant="light" color={statusColor(option.value as ProjectTodoStatus)}>
                            {option.label}
                          </Badge>
                        </Group>
                      </Menu.Item>
                    );
                  })}
                  {statusFilter.length > 0 && (
                    <>
                      <Menu.Divider />
                      <Menu.Item onClick={() => setStatusFilter([])}>Clear selection</Menu.Item>
                    </>
                  )}
                </Menu.Dropdown>
              </Menu>
            </Stack>
            <BadgeSelect
              label="Priority"
              placeholder="All priorities"
              clearable
              data={PRIORITY_OPTIONS}
              value={priorityFilter}
              onChange={setPriorityFilter}
              badgeColor={value => priorityColor(value as ProjectTodoPriority)}
              styles={activeFilterStyles(Boolean(priorityFilter))}
            />
            <Stack gap={4}>
              <Text size="sm" fw={500}>Section</Text>
              <Menu closeOnItemClick={false} withinPortal position="bottom-start">
                <Menu.Target>
                  <Button
                    variant="light"
                    color="gray"
                    justify="flex-start"
                    style={{
                      minWidth: 240,
                      border: sectionFilter.length > 0 ? "2px solid var(--mantine-color-blue-6)" : undefined
                    }}
                  >
                    {sectionFilter.length === 0 ? (
                      <Text size="sm" c="dimmed">All sections</Text>
                    ) : (
                      <Group gap={4} wrap="wrap">
                        {sectionFilter.map(sectionId => {
                          const section = sections.find(item => item.id === sectionId);
                          return section ? (
                            <Badge
                              key={section.id}
                              size="sm"
                              variant="light"
                              color={sectionColor(section.id, sections)}
                              rightSection={
                                <span
                                  role="button"
                                  aria-label={`Remove ${section.name} filter`}
                                  title="Remove filter"
                                  style={{ cursor: "pointer", fontWeight: 700 }}
                                  onMouseDown={event => event.preventDefault()}
                                  onClick={event => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    setSectionFilter(current => current.filter(id => id !== section.id));
                                  }}
                                >×</span>
                              }
                            >
                              {section.name}
                            </Badge>
                          ) : null;
                        })}
                      </Group>
                    )}
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  {sortedSections.map(section => {
                    const checked = sectionFilter.includes(section.id);
                    return (
                      <Menu.Item
                        key={section.id}
                        onClick={() => setSectionFilter(current =>
                          current.includes(section.id)
                            ? current.filter(id => id !== section.id)
                            : [...current, section.id]
                        )}
                      >
                        <Group gap="xs" wrap="nowrap">
                          <Checkbox checked={checked} readOnly size="xs" tabIndex={-1} />
                          <Badge size="sm" variant="light" color={sectionColor(section.id, sections)}>{section.name}</Badge>
                        </Group>
                      </Menu.Item>
                    );
                  })}
                  {sectionFilter.length > 0 && (
                    <>
                      <Menu.Divider />
                      <Menu.Item onClick={() => setSectionFilter([])}>Clear selection</Menu.Item>
                    </>
                  )}
                </Menu.Dropdown>
              </Menu>
            </Stack>
            <ResetFiltersAction active={filtersActive} onReset={resetFilters} />
          </Group>
          <Group>
            <Button
              variant="light"
              onClick={() => { setEditingSection(null); setSectionName(""); setSectionModalOpen(true); }}
            >+ Section</Button>
            <SegmentedControl
              value={view}
              onChange={value => setView(value as "list" | "board")}
              data={[{ value: "list", label: "List" }, { value: "board", label: "Board" }]}
            />
          </Group>
        </Group>
      </Card>

      {view === "list" ? (
        <Stack gap="md">
          {sections
            .filter(section => sectionFilter.length === 0 || sectionFilter.includes(section.id))
            .map((section, sectionIndex) => {
              const stats = sectionStats(section.id, tasks);
              const isCollapsed = collapsed.has(section.id);
              return (
                <Card
                  key={section.id}
                  withBorder
                  padding="sm"
                  style={{ borderLeft: `4px solid ${sectionAccent(sectionColor(section.id, sections))}` }}
                >
                  <Group justify="space-between">
                    <Group gap="xs">
                      <ActionIcon
                        variant="subtle"
                        onClick={() => setCollapsed(current => {
                          const next = new Set(current);
                          if (next.has(section.id)) next.delete(section.id); else next.add(section.id);
                          return next;
                        })}
                      >{isCollapsed ? "▸" : "▾"}</ActionIcon>
                      <Text fw={700} c={sectionColor(section.id, sections)}>{section.name}</Text>
                      <Badge
                        variant="light"
                        color={stats.done === stats.total && stats.total > 0 ? "green" : sectionColor(section.id, sections)}
                      >{stats.done}/{stats.total}</Badge>
                    </Group>
                    <Group gap={4}>
                      <ActionIcon
                        variant="subtle"
                        disabled={sectionIndex === 0}
                        title="Move section up"
                        onClick={async () => {
                          const previous = sections[sectionIndex - 1];
                          if (!previous) return;
                          await Promise.all([
                            updateProjectTodoSection(section.id, { sortOrder: previous.sortOrder }),
                            updateProjectTodoSection(previous.id, { sortOrder: section.sortOrder })
                          ]);
                          await refresh();
                        }}
                      >↑</ActionIcon>
                      <ActionIcon
                        variant="subtle"
                        disabled={sectionIndex === sections.length - 1}
                        title="Move section down"
                        onClick={async () => {
                          const next = sections[sectionIndex + 1];
                          if (!next) return;
                          await Promise.all([
                            updateProjectTodoSection(section.id, { sortOrder: next.sortOrder }),
                            updateProjectTodoSection(next.id, { sortOrder: section.sortOrder })
                          ]);
                          await refresh();
                        }}
                      >↓</ActionIcon>
                      <Button size="xs" variant="subtle" onClick={() => openNewTask(section.id)}>+ Task</Button>
                      <ActionIcon variant="subtle" title="Rename section" onClick={() => { setEditingSection(section); setSectionName(section.name); setSectionModalOpen(true); }}>✎</ActionIcon>
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        title="Delete section"
                        onClick={async () => {
                          if (!window.confirm(`Delete section "${section.name}" and all ${stats.total} task(s) in it?`)) return;
                          await deleteProjectTodoSection(section.id);
                          await refresh();
                        }}
                      >🗑</ActionIcon>
                    </Group>
                  </Group>
                  {!isCollapsed && (
                    <Stack gap="xs" mt="sm">
                      {rootTasksForSection(section.id).map(task => (
                        <TaskRow
                          key={task.id}
                          task={task}
                          depth={0}
                          section={section}
                          tasks={tasks}
                          onEdit={openEditTask}
                          onAddSubtask={parent => openNewTask(parent.sectionId, parent.id)}
                          onRefresh={refresh}
                          onMove={moveTask}
                          onCopyPrompt={copyPrompt}
                          onAdvanceStatus={advanceTaskStatus}
                        />
                      ))}
                      {rootTasksForSection(section.id).length === 0 && <Text size="sm" c="dimmed">No matching tasks.</Text>}
                    </Stack>
                  )}
                </Card>
              );
            })}
          {sections.length === 0 && <Card withBorder><Text c="dimmed">Create a section or import your Markdown todo file to get started.</Text></Card>}
        </Stack>
      ) : (
        <SimpleGrid cols={{ base: 1, lg: 3 }}>
          {(["OPEN", "IN_PROGRESS", "DONE"] as ProjectTodoStatus[]).map(status => {
            const rows = boardRows(status);
            const isDropTarget = draggedTaskId !== null && dragOverStatus === status && dragOverTaskId === null;
            return (
              <Card
                key={status}
                withBorder
                padding="sm"
                onDragOver={event => {
                  if (!draggedTaskId) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDragOverStatus(status);
                  setDragOverTaskId(null);
                }}
                onDrop={async event => {
                  event.preventDefault();
                  await completeBoardDrop(status, null);
                }}
                style={{
                  minHeight: 220,
                  outline: isDropTarget ? "2px solid var(--mantine-color-blue-5)" : undefined,
                  outlineOffset: isDropTarget ? -2 : undefined
                }}
              >
                <Group justify="space-between" mb="sm">
                  <Badge color={statusColor(status)}>{status.replace("_", " ")}</Badge>
                  <Text size="sm" c="dimmed">{rows.length}</Text>
                </Group>
                <Stack gap="xs">
                  {rows.map(task => {
                    const section = sections.find(item => item.id === task.sectionId);
                    const color = section ? sectionColor(section.id, sections) : "gray";
                    const currentStatusIndex = STATUS_ORDER.indexOf(task.status);
                    const isDragged = draggedTaskId === task.id;
                    const isCardDropTarget = draggedTaskId !== null && dragOverTaskId === task.id;
                    return (
                      <Card
                        key={task.id}
                        withBorder
                        padding="sm"
                        draggable
                        onDragStart={event => {
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", task.id);
                          setDraggedTaskId(task.id);
                        }}
                        onDragEnd={() => {
                          setDraggedTaskId(null);
                          setDragOverStatus(null);
                          setDragOverTaskId(null);
                        }}
                        onDragOver={event => {
                          if (!draggedTaskId || draggedTaskId === task.id) return;
                          event.preventDefault();
                          event.stopPropagation();
                          event.dataTransfer.dropEffect = "move";
                          setDragOverStatus(status);
                          setDragOverTaskId(task.id);
                        }}
                        onDrop={async event => {
                          event.preventDefault();
                          event.stopPropagation();
                          if (draggedTaskId === task.id) return;
                          await completeBoardDrop(status, task.id);
                        }}
                        onClick={() => { if (!draggedTaskId) openEditTask(task); }}
                        style={{
                          cursor: isDragged ? "grabbing" : "grab",
                          opacity: isDragged ? 0.45 : 1,
                          borderLeft: `4px solid ${sectionAccent(color)}`,
                          outline: isCardDropTarget ? "2px solid var(--mantine-color-blue-5)" : undefined,
                          outlineOffset: isCardDropTarget ? -2 : undefined
                        }}
                      >
                        <Group justify="space-between" gap="xs" wrap="nowrap">
                          <Group gap="xs" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
                            <Text size="xs" c="dimmed" title="Drag to move task">⋮⋮</Text>
                            <Text fw={600} style={{ minWidth: 0 }}>{task.title}</Text>
                          </Group>
                          <Group gap={2} wrap="nowrap">
                            <ActionIcon
                              size="sm"
                              variant="subtle"
                              disabled={currentStatusIndex <= 0}
                              title="Move to previous column"
                              onClick={async event => {
                                event.stopPropagation();
                                await moveBoardTaskByStatus(task, -1);
                              }}
                            >←</ActionIcon>
                            <ActionIcon
                              size="sm"
                              variant="subtle"
                              disabled={currentStatusIndex >= STATUS_ORDER.length - 1}
                              title="Move to next column"
                              onClick={async event => {
                                event.stopPropagation();
                                await moveBoardTaskByStatus(task, 1);
                              }}
                            >→</ActionIcon>
                            <ActionIcon
                              size="sm"
                              variant="subtle"
                              title="Copy as prompt"
                              onClick={async event => {
                                event.stopPropagation();
                                await copyBoardPrompt(task);
                              }}
                            >⧉</ActionIcon>
                          </Group>
                        </Group>
                        <Group gap="xs" mt={6}>
                          {section && <Badge size="sm" variant="light" color={color}>{section.name}</Badge>}
                          <Badge
                            size="sm"
                            variant="light"
                            color={statusColor(task.status)}
                            style={{ cursor: task.status === "DONE" ? "default" : "pointer" }}
                            title={task.status === "DONE" ? "Task is done" : "Advance status"}
                            onClick={event => {
                              event.stopPropagation();
                              if (task.status !== "DONE") void advanceTaskStatus(task);
                            }}
                          >
                            {task.status.replace("_", " ")}
                          </Badge>
                          <Badge size="sm" variant="light" color={priorityColor(task.priority)}>{task.priority}</Badge>
                          {task.prReference && <Badge size="sm" color="violet" variant="outline">{task.prReference}</Badge>}
                        </Group>
                      </Card>
                    );
                  })}
                  {rows.length === 0 && <Text size="sm" c="dimmed">Drop a task here</Text>}
                </Stack>
              </Card>
            );
          })}
        </SimpleGrid>
      )}

      <Modal opened={taskModalOpen} onClose={() => setTaskModalOpen(false)} title={editingTask ? "Edit task" : newParentId ? "New subtask" : "New task"} size="lg">
        <Stack>
          <BadgeSelect
            label="Section"
            searchable
            data={sortedSections.map(section => ({ value: section.id, label: section.name }))}
            value={taskForm.sectionId}
            onChange={value => value && setTaskForm(current => ({ ...current, sectionId: value }))}
            badgeColor={value => sectionColor(value, sections)}
            required
          />
          <TextInput label="Title" value={taskForm.title} onChange={event => setTaskForm(current => ({ ...current, title: event.currentTarget.value }))} required />
          <Textarea label="Description / notes" minRows={6} autosize value={taskForm.description ?? ""} onChange={event => setTaskForm(current => ({ ...current, description: event.currentTarget.value || null }))} />
          <Group grow>
            <BadgeSelect
              label="Status"
              data={STATUS_OPTIONS}
              value={taskForm.status ?? "OPEN"}
              onChange={value => setTaskForm(current => ({ ...current, status: (value ?? "OPEN") as ProjectTodoStatus }))}
              badgeColor={value => statusColor(value as ProjectTodoStatus)}
            />
            <BadgeSelect
              label="Priority"
              data={PRIORITY_OPTIONS}
              value={taskForm.priority ?? "NORMAL"}
              onChange={value => setTaskForm(current => ({ ...current, priority: (value ?? "NORMAL") as ProjectTodoPriority }))}
              badgeColor={value => priorityColor(value as ProjectTodoPriority)}
            />
          </Group>
          <TextInput label="Component" placeholder="Frontend, API, Simulator…" value={taskForm.component ?? ""} onChange={event => setTaskForm(current => ({ ...current, component: event.currentTarget.value || null }))} />
          <Group grow>
            <TextInput label="PR" placeholder="PR-083" value={taskForm.prReference ?? ""} onChange={event => setTaskForm(current => ({ ...current, prReference: event.currentTarget.value || null }))} />
            <TextInput label="Patch" placeholder="PR-083-….patch" value={taskForm.patchReference ?? ""} onChange={event => setTaskForm(current => ({ ...current, patchReference: event.currentTarget.value || null }))} />
          </Group>
          <Group justify="flex-end">
            <Button variant="light" onClick={() => setTaskModalOpen(false)}>Cancel</Button>
            color="gray"
            <Button
              disabled={!taskForm.title.trim() || !taskForm.sectionId}
              onClick={saveTask}
            >Save</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={sectionModalOpen} onClose={() => setSectionModalOpen(false)} title={editingSection ? "Rename section" : "New section"}>
        <Stack>
          <TextInput label="Name" value={sectionName} onChange={event => setSectionName(event.currentTarget.value)} autoFocus />
          <Group justify="flex-end">
            <Button variant="light" onClick={() => setSectionModalOpen(false)}>Cancel</Button>
            color="gray"
            <Button disabled={!sectionName.trim()} onClick={async () => {
              if (editingSection) await updateProjectTodoSection(editingSection.id, { name: sectionName.trim() });
              else await createProjectTodoSection({ name: sectionName.trim() });
              setSectionModalOpen(false);
              await refresh();
            }}>Save</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={importModalOpen} onClose={() => setImportModalOpen(false)} title="Import Markdown" size="lg">
        <Stack>
          <Text size="sm" c="orange">Import replaces all current Project Todos. Export first if you want a backup.</Text>
          <input
            type="file"
            accept=".md,text/markdown,text/plain"
            onChange={async event => {
              const file = event.currentTarget.files?.[0];
              if (file) setImportMarkdown(await file.text());
            }}
          />
          <Textarea label="Markdown" minRows={14} value={importMarkdown} onChange={event => setImportMarkdown(event.currentTarget.value)} placeholder="## Todos\n\n### SensorSphere App\n\n* [ ] My task" />
          <Group justify="flex-end">
            <Button variant="light" onClick={() => setImportModalOpen(false)}>Cancel</Button>
            color="gray"
            <Button color="orange" disabled={!importMarkdown.trim()} onClick={async () => {
              if (!window.confirm("Replace all current Project Todos with this Markdown import?")) return;
              const result = await importProjectTodosMarkdown(importMarkdown);
              setImportModalOpen(false);
              setMessage(`Imported ${result.tasks} task(s) in ${result.sections} section(s).`);
              await refresh();
            }}>Replace & import</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
