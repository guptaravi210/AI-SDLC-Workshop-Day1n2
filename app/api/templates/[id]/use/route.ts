import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { subtaskDB, templateDB, todoDB } from "@/lib/db";
import { getSingaporeNow } from "@/lib/timezone";

function parseTemplateId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) {
    return null;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const templateId = parseTemplateId(id);
  if (!templateId) {
    return NextResponse.json({ error: "Invalid template id" }, { status: 400 });
  }

  const template = templateDB.getById(templateId, session.userId);
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const dueDate =
    template.due_date_offset_minutes === null
      ? null
      : new Date(getSingaporeNow().getTime() + template.due_date_offset_minutes * 60 * 1000).toISOString();

  const todo = todoDB.create(session.userId, {
    title: template.title,
    priority: template.priority,
    due_date: dueDate,
    is_recurring: template.is_recurring === 1,
    recurrence_pattern: template.recurrence_pattern,
    reminder_minutes: template.reminder_minutes,
  });

  const subtasks = JSON.parse(template.subtasks_json || "[]") as Array<{ title: string }>;
  for (const subtask of subtasks) {
    if (typeof subtask.title === "string" && subtask.title.trim()) {
      subtaskDB.create(todo.id, subtask.title.trim());
    }
  }

  return NextResponse.json(todo, { status: 201 });
}
