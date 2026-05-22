import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { templateDB, type Priority, type RecurrencePattern } from "@/lib/db";

const templateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(300).nullable().optional(),
  category: z.string().trim().max(50).nullable().optional(),
  priority: z.enum(["high", "medium", "low"]).optional(),
  is_recurring: z.boolean().optional(),
  recurrence_pattern: z.enum(["", "daily", "weekly", "monthly", "yearly"]).optional(),
  reminder_minutes: z.number().int().min(0).max(10080).nullable().optional(),
  subtasks_json: z.string().optional(),
  due_date_offset_minutes: z.number().int().min(0).max(525600).nullable().optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  return NextResponse.json(templateDB.getAllByUser(session.userId));
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = templateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const normalizedRecurring = parsed.data.is_recurring ?? false;
  const normalizedPattern = normalizedRecurring ? (parsed.data.recurrence_pattern ?? "") : "";
  if (normalizedRecurring && !normalizedPattern) {
    return NextResponse.json({ error: "Recurring templates require a recurrence pattern" }, { status: 400 });
  }

  const template = templateDB.create(session.userId, {
    name: parsed.data.name,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    category: parsed.data.category ?? null,
    priority: (parsed.data.priority ?? "medium") as Priority,
    is_recurring: normalizedRecurring,
    recurrence_pattern: normalizedPattern as RecurrencePattern,
    reminder_minutes: parsed.data.reminder_minutes ?? null,
    subtasks_json: parsed.data.subtasks_json ?? "[]",
    due_date_offset_minutes: parsed.data.due_date_offset_minutes ?? null,
  });

  return NextResponse.json(template, { status: 201 });
}
