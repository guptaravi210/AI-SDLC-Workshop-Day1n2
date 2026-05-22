import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { tagDB, todoDB, type Priority, type RecurrencePattern } from "@/lib/db";
import { isDueDateValid } from "@/lib/todo-helpers";
import { parseDateInSingapore } from "@/lib/timezone";

const createTodoSchema = z.object({
  title: z.string().max(200),
  priority: z.enum(["high", "medium", "low"]).optional(),
  due_date: z.string().nullable().optional(),
  is_recurring: z.boolean().optional(),
  recurrence_pattern: z.enum(["", "daily", "weekly", "monthly", "yearly"]).optional(),
  reminder_minutes: z.number().int().min(0).max(10080).nullable().optional(),
  tag_ids: z.array(z.number().int().positive()).optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const todos = todoDB.getAllDetailedByUser(session.userId);
  return NextResponse.json(todos);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createTodoSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const title = parsed.data.title.trim();
  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  let normalizedDueDate: string | null = null;
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

  if (parsed.data.is_recurring && !normalizedDueDate) {
    return NextResponse.json({ error: "Recurring todos require a due date" }, { status: 400 });
  }

  const normalizedRecurring = parsed.data.is_recurring ?? false;
  const normalizedPattern = normalizedRecurring ? (parsed.data.recurrence_pattern ?? "") : "";

  if (normalizedRecurring && !normalizedPattern) {
    return NextResponse.json(
      { error: "Invalid recurrence pattern. Must be one of: daily, weekly, monthly, yearly" },
      { status: 400 }
    );
  }

  const todo = todoDB.create(session.userId, {
    title,
    priority: (parsed.data.priority ?? "medium") as Priority,
    due_date: normalizedDueDate,
    is_recurring: normalizedRecurring,
    recurrence_pattern: normalizedPattern as RecurrencePattern,
    reminder_minutes: parsed.data.reminder_minutes ?? null,
  });

  if (parsed.data.tag_ids && parsed.data.tag_ids.length > 0) {
    const validTagIds = parsed.data.tag_ids
      .map((id) => tagDB.getById(id, session.userId))
      .filter((tag): tag is NonNullable<typeof tag> => Boolean(tag))
      .map((tag) => tag.id);

    tagDB.setTodoTags(todo.id, validTagIds);
  }

  return NextResponse.json(todoDB.getAllDetailedByUser(session.userId).find((item) => item.id === todo.id), { status: 201 });
}
