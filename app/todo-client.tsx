"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { sortTodos } from "@/lib/todo-helpers";
import { formatSingaporeDate, getSingaporeNow, parseDateInSingapore } from "@/lib/timezone";
import { REMINDER_OPTIONS, getReminderBadge } from "@/lib/reminders";

type Priority = "high" | "medium" | "low";

interface Todo {
  id: number;
  title: string;
  priority: Priority;
  due_date: string | null;
  is_completed: number;
  is_recurring: number;
  recurrence_pattern: "" | "daily" | "weekly" | "monthly" | "yearly";
  reminder_minutes: number | null;
  subtasks: Subtask[];
  tags: Tag[];
  created_at: string;
}

interface Subtask {
  id: number;
  title: string;
  is_completed: number;
}

interface Tag {
  id: number;
  name: string;
  color: string;
}

interface Template {
  id: number;
  name: string;
  title: string;
  category: string | null;
}

interface FilterPreset {
  id: string;
  name: string;
  priority: Priority | "all";
  tagFilter: number | "all";
  completionFilter: "all" | "incomplete" | "completed";
  dueDateFrom: string;
  dueDateTo: string;
}

type TodoSection = "overdue" | "active" | "completed";

const priorityClass: Record<Priority, string> = {
  high: "bg-red-100 text-red-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-blue-100 text-blue-800",
};

const priorityLabel: Record<Priority, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

interface TodoClientProps {
  initialTodos: Todo[];
}

export default function TodoClient({ initialTodos }: TodoClientProps) {
  const router = useRouter();
  const [todos, setTodos] = useState<Todo[]>(initialTodos);
  const [tags, setTags] = useState<Tag[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "all">("all");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrencePattern, setRecurrencePattern] = useState<"daily" | "weekly" | "monthly" | "yearly">("daily");
  const [dueDate, setDueDate] = useState("");
  const [reminderMinutes, setReminderMinutes] = useState<number | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#3B82F6");
  const [templateName, setTemplateName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<number | "all">("all");
  const [completionFilter, setCompletionFilter] = useState<"all" | "incomplete" | "completed">("all");
  const [dueDateFrom, setDueDateFrom] = useState("");
  const [dueDateTo, setDueDateTo] = useState("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [expandedSubtasks, setExpandedSubtasks] = useState<Record<number, boolean>>({});
  const [newSubtaskText, setNewSubtaskText] = useState<Record<number, string>>({});
  const [notificationsOn, setNotificationsOn] = useState(false);
  const [filterPresets, setFilterPresets] = useState<FilterPreset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function loadTodos() {
    try {
      const response = await fetch("/api/todos");
      if (!response.ok) {
        setError("Failed to load todos");
        return;
      }

      const data = (await response.json()) as Todo[];
      setTodos(data);
    } catch {
      setError("Network error while loading todos");
    }
  }

  async function loadTags() {
    const response = await fetch("/api/tags").catch(() => null);
    if (!response?.ok) {
      return;
    }

    const data = (await response.json()) as Tag[];
    setTags(data);
  }

  async function loadTemplates() {
    const response = await fetch("/api/templates").catch(() => null);
    if (!response?.ok) {
      return;
    }

    const data = (await response.json()) as Template[];
    setTemplates(data);
  }

  useEffect(() => {
    void loadTags();
    void loadTemplates();
    const stored = localStorage.getItem("todo-filter-presets");
    if (stored) {
      setFilterPresets(JSON.parse(stored) as FilterPreset[]);
    }
    if (typeof Notification !== "undefined") {
      setNotificationsOn(Notification.permission === "granted");
    }
  }, []);

  function saveCurrentFilterPreset() {
    const name = window.prompt("Preset name");
    if (!name?.trim()) {
      return;
    }

    const next = [
      ...filterPresets,
      {
        id: crypto.randomUUID(),
        name: name.trim(),
        priority: priorityFilter,
        tagFilter,
        completionFilter,
        dueDateFrom,
        dueDateTo,
      },
    ];
    setFilterPresets(next);
    localStorage.setItem("todo-filter-presets", JSON.stringify(next));
  }

  function applyFilterPreset(presetId: string) {
    const preset = filterPresets.find((item) => item.id === presetId);
    if (!preset) {
      return;
    }

    setPriorityFilter(preset.priority);
    setTagFilter(preset.tagFilter);
    setCompletionFilter(preset.completionFilter);
    setDueDateFrom(preset.dueDateFrom);
    setDueDateTo(preset.dueDateTo);
  }

  useEffect(() => {
    if (!notificationsOn) {
      return;
    }

    const interval = window.setInterval(async () => {
      const response = await fetch("/api/notifications/check").catch(() => null);
      if (!response?.ok) {
        return;
      }

      const payload = (await response.json()) as { todos: Array<{ id: number; title: string; due_date: string | null }> };
      for (const todo of payload.todos) {
        if (todo.due_date) {
          new Notification("\ud83d\udccb Todo Reminder", {
            body: `${todo.title} \u2014 Due: ${formatSingaporeDate(todo.due_date)}`,
          });
        }
      }
    }, 30000);

    return () => window.clearInterval(interval);
  }, [notificationsOn]);

  async function enableNotifications() {
    if (typeof Notification === "undefined") {
      setError("Notifications are not supported in this browser");
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationsOn(permission === "granted");
  }

  async function onCreateTodo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          priority,
          due_date: dueDate || null,
          is_recurring: isRecurring,
          recurrence_pattern: isRecurring ? recurrencePattern : "",
          reminder_minutes: dueDate ? reminderMinutes : null,
          tag_ids: selectedTagIds,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Failed to create todo");
        return;
      }

      setTitle("");
      setPriority("medium");
      setIsRecurring(false);
      setRecurrencePattern("daily");
      setDueDate("");
      setReminderMinutes(null);
      setSelectedTagIds([]);
      await loadTodos();
    } catch {
      setError("Network error while creating todo");
    } finally {
      setLoading(false);
    }
  }

  async function onToggleComplete(todo: Todo) {
    try {
      const response = await fetch(`/api/todos/${todo.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_completed: todo.is_completed === 0 }),
      });

      if (!response.ok) {
        setError("Failed to update todo");
        return;
      }

      await loadTodos();
    } catch {
      setError("Network error while updating todo");
    }
  }

  async function onDelete(todoId: number) {
    try {
      const response = await fetch(`/api/todos/${todoId}`, { method: "DELETE" });
      if (!response.ok) {
        setError("Failed to delete todo");
        return;
      }

      await loadTodos();
    } catch {
      setError("Network error while deleting todo");
    }
  }

  async function onCreateTag() {
    if (!newTagName.trim()) {
      return;
    }

    const response = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newTagName, color: newTagColor }),
    }).catch(() => null);

    if (!response?.ok) {
      return;
    }

    setNewTagName("");
    await loadTags();
  }

  async function onDeleteTag(tagId: number) {
    await fetch(`/api/tags/${tagId}`, { method: "DELETE" });
    await loadTags();
    await loadTodos();
  }

  async function onAddSubtask(todoId: number) {
    const title = newSubtaskText[todoId]?.trim();
    if (!title) {
      return;
    }

    const response = await fetch(`/api/todos/${todoId}/subtasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }).catch(() => null);

    if (!response?.ok) {
      return;
    }

    setNewSubtaskText((prev) => ({ ...prev, [todoId]: "" }));
    await loadTodos();
  }

  async function onToggleSubtask(subtaskId: number, isCompleted: boolean) {
    await fetch(`/api/subtasks/${subtaskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_completed: !isCompleted }),
    });
    await loadTodos();
  }

  async function onDeleteSubtask(subtaskId: number) {
    await fetch(`/api/subtasks/${subtaskId}`, { method: "DELETE" });
    await loadTodos();
  }

  async function onSaveTemplate() {
    if (!title.trim() || !templateName.trim()) {
      return;
    }

    const subtasks = [] as Array<{ title: string; position: number }>;
    const response = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: templateName,
        title,
        priority,
        is_recurring: isRecurring,
        recurrence_pattern: isRecurring ? recurrencePattern : "",
        reminder_minutes: reminderMinutes,
        subtasks_json: JSON.stringify(subtasks),
        due_date_offset_minutes: dueDate ? 60 : null,
      }),
    });

    if (!response.ok) {
      return;
    }

    setTemplateName("");
    await loadTemplates();
  }

  async function onUseTemplate(templateId: number) {
    await fetch(`/api/templates/${templateId}/use`, { method: "POST" });
    await loadTodos();
  }

  async function onDeleteTemplate(templateId: number) {
    await fetch(`/api/templates/${templateId}`, { method: "DELETE" });
    await loadTemplates();
  }

  async function onImportFile(file: File) {
    const text = await file.text();
    const payload = JSON.parse(text) as unknown;

    const response = await fetch("/api/todos/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      setError("Import failed");
      return;
    }

    await loadTodos();
    await loadTags();
  }

  async function onLogout() {
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) {
        setError("Failed to logout");
        return;
      }

      router.push("/login");
      router.refresh();
    } catch {
      setError("Network error while logging out");
    }
  }

  const filteredTodos = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return todos.filter((todo) => {
      if (query) {
        const titleMatch = todo.title.toLowerCase().includes(query);
        const subtaskMatch = todo.subtasks.some((subtask) => subtask.title.toLowerCase().includes(query));
        if (!titleMatch && !subtaskMatch) {
          return false;
        }
      }

      if (priorityFilter !== "all" && todo.priority !== priorityFilter) {
        return false;
      }

      if (tagFilter !== "all" && !todo.tags.some((tag) => tag.id === tagFilter)) {
        return false;
      }

      if (completionFilter === "completed" && todo.is_completed !== 1) {
        return false;
      }

      if (completionFilter === "incomplete" && todo.is_completed !== 0) {
        return false;
      }

      if (dueDateFrom) {
        if (!todo.due_date || todo.due_date < `${dueDateFrom}T00:00:00`) {
          return false;
        }
      }

      if (dueDateTo) {
        if (!todo.due_date || todo.due_date > `${dueDateTo}T23:59:59`) {
          return false;
        }
      }

      return true;
    });
  }, [completionFilter, dueDateFrom, dueDateTo, priorityFilter, searchQuery, tagFilter, todos]);

  const sectionedTodos = useMemo(() => {
    const nowTs = getSingaporeNow().getTime();
    const sorted = sortTodos(filteredTodos);

    return sorted.reduce<Record<TodoSection, Todo[]>>(
      (acc, todo) => {
        if (todo.is_completed) {
          acc.completed.push(todo);
          return acc;
        }

        const dueDate = todo.due_date ? parseDateInSingapore(todo.due_date) : null;
        if (dueDate && dueDate.getTime() < nowTs) {
          acc.overdue.push(todo);
          return acc;
        }

        acc.active.push(todo);
        return acc;
      },
      { overdue: [], active: [], completed: [] }
    );
  }, [filteredTodos]);

  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-900">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-semibold">Todo App</h1>
          <div className="flex items-center gap-2">
            <button
              className={`rounded px-3 py-2 text-sm ${notificationsOn ? "bg-emerald-600 text-white" : "bg-orange-500 text-white"}`}
              onClick={enableNotifications}
            >
              {notificationsOn ? "\ud83d\udd14 Notifications On" : "\ud83d\udd14 Enable Notifications"}
            </button>
            <Link href="/calendar" className="rounded border border-slate-300 bg-white px-3 py-2">
              Calendar
            </Link>
            <button className="rounded border border-slate-300 bg-white px-3 py-2" onClick={onLogout}>
              Logout
            </button>
          </div>
        </header>

        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 shadow-sm">
          <a className="rounded bg-emerald-600 px-3 py-2 text-sm text-white" href="/api/todos/export" target="_blank" rel="noreferrer">
            Export JSON
          </a>
          <a className="rounded bg-emerald-800 px-3 py-2 text-sm text-white" href="/api/todos/export?format=csv" target="_blank" rel="noreferrer">
            Export CSV
          </a>
          <button className="rounded bg-blue-600 px-3 py-2 text-sm text-white" onClick={() => fileInputRef.current?.click()}>
            Import JSON
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void onImportFile(file);
              }
            }}
          />
          <select
            value=""
            onChange={(event) => {
              const value = Number.parseInt(event.target.value, 10);
              if (Number.isSafeInteger(value)) {
                void onUseTemplate(value);
              }
            }}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Use Template</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>{template.name}</option>
            ))}
          </select>
        </div>

        <form onSubmit={onCreateTodo} className="mb-6 grid gap-3 rounded-xl bg-white p-4 shadow-sm md:grid-cols-4">
          <input
            className="rounded border border-slate-300 px-3 py-2 md:col-span-2"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Add todo title"
            required
          />
          <select
            aria-label="Select priority"
            className="rounded border border-slate-300 px-3 py-2"
            value={priority}
            onChange={(event) => setPriority(event.target.value as Priority)}
          >
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <input
            type="datetime-local"
            className="rounded border border-slate-300 px-3 py-2"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
          <select
            aria-label="Select reminder"
            className="rounded border border-slate-300 px-3 py-2"
            value={reminderMinutes === null ? "none" : String(reminderMinutes)}
            onChange={(event) =>
              setReminderMinutes(event.target.value === "none" ? null : Number.parseInt(event.target.value, 10))
            }
            disabled={!dueDate}
          >
            {REMINDER_OPTIONS.map((option) => (
              <option key={option.label} value={option.value === null ? "none" : String(option.value)}>
                {option.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 rounded border border-slate-300 px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={isRecurring}
              onChange={(event) => setIsRecurring(event.target.checked)}
            />
            Repeat
          </label>
          {isRecurring ? (
            <select
              aria-label="Select recurrence pattern"
              className="rounded border border-slate-300 px-3 py-2"
              value={recurrencePattern}
              onChange={(event) =>
                setRecurrencePattern(event.target.value as "daily" | "weekly" | "monthly" | "yearly")
              }
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          ) : null}
          {tags.length > 0 ? (
            <div className="md:col-span-4">
              <p className="mb-2 text-sm font-medium">Tags</p>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => {
                  const selected = selectedTagIds.includes(tag.id);
                  return (
                    <button
                      type="button"
                      key={tag.id}
                      onClick={() =>
                        setSelectedTagIds((prev) =>
                          prev.includes(tag.id) ? prev.filter((id) => id !== tag.id) : [...prev, tag.id]
                        )
                      }
                      className={`rounded-full border px-3 py-1 text-xs ${selected ? "text-white" : "text-slate-700"}`}
                      style={{ backgroundColor: selected ? tag.color : "white", borderColor: tag.color }}
                    >
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          <div className="md:col-span-4 flex flex-wrap items-center gap-2 rounded border border-slate-200 p-2">
            <input
              className="rounded border border-slate-300 px-2 py-1 text-sm"
              value={newTagName}
              onChange={(event) => setNewTagName(event.target.value)}
              placeholder="New tag"
            />
            <input type="color" value={newTagColor} onChange={(event) => setNewTagColor(event.target.value)} />
            <button type="button" className="rounded bg-slate-800 px-3 py-1 text-sm text-white" onClick={onCreateTag}>
              + Manage Tags
            </button>
            {tags.map((tag) => (
              <button
                type="button"
                key={`manage-${tag.id}`}
                className="rounded border border-slate-300 px-2 py-1 text-xs"
                onClick={() => onDeleteTag(tag.id)}
              >
                Delete {tag.name}
              </button>
            ))}
          </div>
          <div className="md:col-span-4 flex items-center gap-2 rounded border border-slate-200 p-2">
            <input
              className="rounded border border-slate-300 px-2 py-1 text-sm"
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              placeholder="Template name"
            />
            <button type="button" className="rounded bg-indigo-600 px-3 py-1 text-sm text-white" onClick={onSaveTemplate}>
              \ud83d\udcbe Save as Template
            </button>
            {templates.map((template) => (
              <button
                type="button"
                key={`template-delete-${template.id}`}
                className="rounded border border-slate-300 px-2 py-1 text-xs"
                onClick={() => onDeleteTemplate(template.id)}
              >
                Delete {template.name}
              </button>
            ))}
          </div>
          <button
            type="submit"
            disabled={loading}
            className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50 md:col-span-4"
          >
            {loading ? "Adding..." : "Add Todo"}
          </button>
          {error ? <p className="text-sm text-red-600 md:col-span-4">{error}</p> : null}
        </form>

        <div className="mb-4 rounded-xl bg-white p-4 shadow-sm">
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2"
            placeholder="\ud83d\udd0d Search todos or subtasks"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              className="rounded border border-slate-300 px-3 py-2 text-sm"
              value={tagFilter === "all" ? "all" : String(tagFilter)}
              onChange={(event) =>
                setTagFilter(event.target.value === "all" ? "all" : Number.parseInt(event.target.value, 10))
              }
            >
              <option value="all">All Tags</option>
              {tags.map((tag) => (
                <option key={`filter-${tag.id}`} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="rounded border border-slate-300 px-3 py-2 text-sm"
              onClick={() => setShowAdvancedFilters((prev) => !prev)}
            >
              Advanced
            </button>
          </div>
          {showAdvancedFilters ? (
            <div className="mt-3 grid gap-2 md:grid-cols-4">
              <select
                value={completionFilter}
                onChange={(event) => setCompletionFilter(event.target.value as "all" | "incomplete" | "completed")}
                className="rounded border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="all">All Todos</option>
                <option value="incomplete">Incomplete Only</option>
                <option value="completed">Completed Only</option>
              </select>
              <input
                type="date"
                value={dueDateFrom}
                onChange={(event) => setDueDateFrom(event.target.value)}
                className="rounded border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                type="date"
                value={dueDateTo}
                onChange={(event) => setDueDateTo(event.target.value)}
                className="rounded border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                className="rounded bg-red-600 px-3 py-2 text-sm text-white"
                onClick={() => {
                  setSearchQuery("");
                  setPriorityFilter("all");
                  setTagFilter("all");
                  setCompletionFilter("all");
                  setDueDateFrom("");
                  setDueDateTo("");
                }}
              >
                Clear All
              </button>
              <button type="button" className="rounded bg-emerald-600 px-3 py-2 text-sm text-white" onClick={saveCurrentFilterPreset}>
                Save Filter
              </button>
              {filterPresets.length > 0 ? (
                <select
                  className="rounded border border-slate-300 px-3 py-2 text-sm"
                  value=""
                  onChange={(event) => applyFilterPreset(event.target.value)}
                >
                  <option value="">Saved Presets</option>
                  {filterPresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="mb-4 flex items-center gap-2">
          <label htmlFor="priority-filter" className="text-sm font-medium text-slate-700">
            Priority Filter
          </label>
          <select
            id="priority-filter"
            aria-label="Filter by priority"
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm"
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value as Priority | "all")}
          >
            <option value="all">All Priorities</option>
            <option value="high">High Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="low">Low Priority</option>
          </select>
        </div>

        {(["overdue", "active", "completed"] as TodoSection[]).map((section) => (
          <section key={section} className="mb-5 rounded-xl bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-xl font-semibold capitalize">
              {section} ({sectionedTodos[section].length})
            </h2>
            {sectionedTodos[section].length === 0 ? (
              <p className="text-sm text-slate-500">No todos in this section.</p>
            ) : (
              <ul className="space-y-3">
                {sectionedTodos[section].map((todo) => (
                  <li
                    key={todo.id}
                    className={`flex items-center justify-between rounded border p-3 ${
                      section === "overdue" ? "border-red-300 bg-red-50" : "border-slate-200"
                    }`}
                  >
                    <div>
                      <p className={todo.is_completed ? "line-through text-slate-500" : ""}>{todo.title}</p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-600">
                        <span
                          role="status"
                          aria-label={`Priority: ${priorityLabel[todo.priority]}`}
                          className={`rounded px-2 py-1 font-semibold ${priorityClass[todo.priority]}`}
                        >
                          {priorityLabel[todo.priority]}
                        </span>
                        {todo.is_recurring ? (
                          <span className="rounded bg-emerald-100 px-2 py-1 font-semibold text-emerald-800">
                            {`\u21bb ${todo.recurrence_pattern || "recurring"}`}
                          </span>
                        ) : null}
                        {todo.reminder_minutes !== null ? (
                          <span className="rounded bg-orange-100 px-2 py-1 font-semibold text-orange-800">
                            {getReminderBadge(todo.reminder_minutes)}
                          </span>
                        ) : null}
                        {todo.tags.map((tag) => (
                          <button
                            key={`${todo.id}-${tag.id}`}
                            className="rounded-full px-2 py-1 text-white"
                            style={{ backgroundColor: tag.color }}
                            onClick={() => setTagFilter(tag.id)}
                          >
                            {tag.name}
                          </button>
                        ))}
                        {todo.due_date ? <span>Due: {formatSingaporeDate(todo.due_date)}</span> : null}
                      </div>
                      {todo.subtasks.length > 0 ? (
                        <div className="mt-2">
                          <div className="mb-1 h-2 w-full rounded bg-slate-200">
                            <div
                              className="h-2 rounded bg-emerald-500"
                              style={{
                                width: `${
                                  (todo.subtasks.filter((subtask) => subtask.is_completed === 1).length /
                                    Math.max(todo.subtasks.length, 1)) *
                                  100
                                }%`,
                              }}
                            />
                          </div>
                          <p className="text-xs text-slate-500">
                            {todo.subtasks.filter((subtask) => subtask.is_completed === 1).length}/{todo.subtasks.length} subtasks
                          </p>
                        </div>
                      ) : null}
                      <div className="mt-2">
                        <button
                          type="button"
                          className="rounded border border-slate-300 px-2 py-1 text-xs"
                          onClick={() =>
                            setExpandedSubtasks((prev) => ({
                              ...prev,
                              [todo.id]: !prev[todo.id],
                            }))
                          }
                        >
                          {expandedSubtasks[todo.id] ? "\u25bc Subtasks" : "\u25b6 Subtasks"}
                        </button>
                        {expandedSubtasks[todo.id] ? (
                          <div className="mt-2 space-y-2 rounded border border-slate-200 p-2">
                            {todo.subtasks.map((subtask) => (
                              <div key={subtask.id} className="flex items-center justify-between text-sm">
                                <label className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={subtask.is_completed === 1}
                                    onChange={() => onToggleSubtask(subtask.id, subtask.is_completed === 1)}
                                  />
                                  <span className={subtask.is_completed ? "line-through text-slate-400" : ""}>{subtask.title}</span>
                                </label>
                                <button
                                  type="button"
                                  className="rounded border border-slate-300 px-2 py-1 text-xs"
                                  onClick={() => onDeleteSubtask(subtask.id)}
                                >
                                  \u2715
                                </button>
                              </div>
                            ))}
                            <div className="flex gap-2">
                              <input
                                className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
                                value={newSubtaskText[todo.id] ?? ""}
                                onChange={(event) =>
                                  setNewSubtaskText((prev) => ({ ...prev, [todo.id]: event.target.value }))
                                }
                                placeholder="Add subtask"
                              />
                              <button
                                type="button"
                                className="rounded bg-slate-700 px-3 py-1 text-white"
                                onClick={() => onAddSubtask(todo.id)}
                              >
                                Add
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={todo.is_completed === 1}
                        onChange={() => onToggleComplete(todo)}
                      />
                      <button
                        onClick={() => onDelete(todo.id)}
                        className="rounded border border-slate-300 px-2 py-1 text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </main>
  );
}
