import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { tagDB, todoDB, type Priority, type RecurrencePattern } from "@/lib/db";
import { calculateNextRecurringDueDate, isDueDateValid } from "@/lib/todo-helpers";
import { parseDateInSingapore } from "@/lib/timezone";

const updateTodoSchema = z.object({
  title: z.string().max(200).optional(),
  priority: z.enum(["high", "medium", "low"]).optional(),
  due_date: z.string().nullable().optional(),
  is_completed: z.boolean().optional(),
  is_recurring: z.boolean().optional(),
  recurrence_pattern: z.enum(["", "daily", "weekly", "monthly", "yearly"]).optional(),
  reminder_minutes: z.number().int().min(0).max(10080).nullable().optional(),
  tag_ids: z.array(z.number().int().positive()).optional(),
});

function parseTodoId(rawId: string): number | null {
  if (!/^\d+$/.test(rawId)) {
    return null;
  }

  const parsed = Number.parseInt(rawId, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const todoId = parseTodoId(id);
  if (!todoId) {
    return NextResponse.json({ error: "Invalid todo id" }, { status: 400 });
  }

  const todo = todoDB.getById(todoId, session.userId);
  if (!todo) {
    return NextResponse.json({ error: "Todo not found" }, { status: 404 });
  }

  return NextResponse.json({ ...todo, subtasks: [], tags: tagDB.getByTodoId(todo.id, session.userId) });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const todoId = parseTodoId(id);
  if (!todoId) {
    return NextResponse.json({ error: "Invalid todo id" }, { status: 400 });
  }

  const existingTodo = todoDB.getById(todoId, session.userId);
  if (!existingTodo) {
    return NextResponse.json({ error: "Todo not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateTodoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (parsed.data.title !== undefined && !parsed.data.title.trim()) {
    return NextResponse.json({ error: "Title cannot be empty" }, { status: 400 });
  }

  let normalizedDueDate: string | null | undefined = parsed.data.due_date;
  if (parsed.data.due_date) {
    const parsedDueDate = parseDateInSingapore(parsed.data.due_date);
    if (!parsedDueDate) {
      return NextResponse.json({ error: "Invalid due date" }, { status: 400 });
    }

    normalizedDueDate = parsedDueDate.toISOString();
  }

  if (normalizedDueDate && !isDueDateValid(normalizedDueDate)) {
    return NextResponse.json(
      { error: "Due date must be at least 1 minute in the future" },
      { status: 400 }
    );
  }

  const effectiveDueDate = normalizedDueDate === undefined ? existingTodo.due_date : normalizedDueDate;
  const effectiveRecurring = parsed.data.is_recurring === undefined ? existingTodo.is_recurring === 1 : parsed.data.is_recurring;
  const requestedPattern =
    parsed.data.recurrence_pattern === undefined ? existingTodo.recurrence_pattern : parsed.data.recurrence_pattern;
  const effectivePattern = effectiveRecurring ? requestedPattern : "";

  if (effectiveRecurring && !effectiveDueDate) {
    return NextResponse.json({ error: "Recurring todos require a due date" }, { status: 400 });
  }

  if (effectiveRecurring && !effectivePattern) {
    return NextResponse.json(
      { error: "Invalid recurrence pattern. Must be one of: daily, weekly, monthly, yearly" },
      { status: 400 }
    );
  }

  const updatePayload = {
    title: parsed.data.title?.trim(),
    priority: parsed.data.priority as Priority | undefined,
    due_date: normalizedDueDate,
    is_completed: parsed.data.is_completed,
    is_recurring: parsed.data.is_recurring,
    recurrence_pattern: effectivePattern as RecurrencePattern,
    reminder_minutes: parsed.data.reminder_minutes,
  };

  const shouldGenerateNext =
    existingTodo.is_completed === 0 &&
    parsed.data.is_completed === true &&
    effectiveRecurring &&
    !!effectivePattern &&
    !!effectiveDueDate;

  if (shouldGenerateNext) {
    const nextDueDate = calculateNextRecurringDueDate(
      effectiveDueDate as string,
      effectivePattern as "daily" | "weekly" | "monthly" | "yearly"
    );

    if (nextDueDate) {
      const result = todoDB.updateAndCreateRecurringNext(todoId, session.userId, updatePayload, nextDueDate);
      if (!result.updated) {
        return NextResponse.json({ error: "Todo not found" }, { status: 404 });
      }

      return NextResponse.json({ ...result.updated, nextInstance: result.nextInstance });
    }
  }

  const updated = todoDB.update(todoId, session.userId, updatePayload);

  if (!updated) {
    return NextResponse.json({ error: "Todo not found" }, { status: 404 });
  }

  if (parsed.data.tag_ids) {
    const validTagIds = parsed.data.tag_ids
      .map((tagId) => tagDB.getById(tagId, session.userId))
      .filter((tag): tag is NonNullable<typeof tag> => Boolean(tag))
      .map((tag) => tag.id);
    tagDB.setTodoTags(todoId, validTagIds);
  }

  if (parsed.data.reminder_minutes !== undefined || parsed.data.due_date !== undefined) {
    todoDB.resetNotificationSent(todoId, session.userId);
  }

  return NextResponse.json({ ...updated, tags: tagDB.getByTodoId(todoId, session.userId), nextInstance: null });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const todoId = parseTodoId(id);
  if (!todoId) {
    return NextResponse.json({ error: "Invalid todo id" }, { status: 400 });
  }

  const deleted = todoDB.delete(todoId, session.userId);

  if (!deleted) {
    return NextResponse.json({ error: "Todo not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
