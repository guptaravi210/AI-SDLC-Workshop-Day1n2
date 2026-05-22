import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { subtaskDB, tagDB, todoDB, type Priority, type RecurrencePattern } from "@/lib/db";

const importSubtaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  is_completed: z.number().int().min(0).max(1).optional(),
});

const importTodoSchema = z.object({
  title: z.string().trim().min(1).max(200),
  priority: z.enum(["high", "medium", "low"]).optional(),
  due_date: z.string().nullable().optional(),
  is_completed: z.number().int().min(0).max(1).optional(),
  is_recurring: z.boolean().optional(),
  recurrence_pattern: z.enum(["", "daily", "weekly", "monthly", "yearly"]).nullable().optional(),
  reminder_minutes: z.number().int().min(0).max(10080).nullable().optional(),
  subtasks: z.array(importSubtaskSchema).optional(),
  tags: z.array(z.string()).optional(),
});

const importPayloadSchema = z.object({
  todos: z.array(importTodoSchema),
  tags: z.array(z.object({ name: z.string().trim().min(1), color: z.string().regex(/^#[0-9A-Fa-f]{6}$/) })).optional(),
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = importPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid import file format" }, { status: 400 });
  }

  let importedCount = 0;

  for (const incoming of parsed.data.todos) {
    const todo = todoDB.create(session.userId, {
      title: incoming.title,
      priority: (incoming.priority ?? "medium") as Priority,
      due_date: incoming.due_date ?? null,
      is_recurring: incoming.is_recurring ?? false,
      recurrence_pattern: ((incoming.recurrence_pattern ?? "") || "") as RecurrencePattern,
      reminder_minutes: incoming.reminder_minutes ?? null,
    });

    if (incoming.is_completed) {
      todoDB.update(todo.id, session.userId, { is_completed: true });
    }

    for (const subtask of incoming.subtasks ?? []) {
      const created = subtaskDB.create(todo.id, subtask.title);
      if (subtask.is_completed === 1) {
        subtaskDB.update(created.id, { is_completed: 1 });
      }
    }

    const tagIds: number[] = [];
    for (const tagName of incoming.tags ?? []) {
      const normalizedName = tagName.trim();
      if (!normalizedName) {
        continue;
      }

      let tag = tagDB.getByName(session.userId, normalizedName);
      if (!tag) {
        const fallbackColor =
          parsed.data.tags?.find((item) => item.name.toLowerCase() === normalizedName.toLowerCase())?.color || "#3B82F6";
        tag = tagDB.create(session.userId, normalizedName, fallbackColor);
      }

      tagIds.push(tag.id);
    }

    if (tagIds.length > 0) {
      tagDB.setTodoTags(todo.id, tagIds);
    }

    importedCount += 1;
  }

  return NextResponse.json({ message: `Successfully imported ${importedCount} todos`, count: importedCount });
}
