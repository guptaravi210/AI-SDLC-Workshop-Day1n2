import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getSingaporeNow } from "@/lib/timezone";
import { tagDB, todoDB } from "@/lib/db";

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes("\"") || value.includes("\n")) {
    return `"${value.replace(/\"/g, '""')}"`;
  }
  return value;
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const format = url.searchParams.get("format") || "json";
  if (format !== "json" && format !== "csv") {
    return NextResponse.json({ error: "Invalid format. Use json or csv" }, { status: 400 });
  }

  const todos = todoDB.getAllDetailedByUser(session.userId);
  const datePart = getSingaporeNow().toISOString().slice(0, 10);

  if (format === "csv") {
    const header = ["ID", "Title", "Completed", "Due Date", "Priority", "Recurring", "Pattern", "Reminder"].join(",");
    const rows = todos.map((todo) =>
      [
        String(todo.id),
        csvEscape(todo.title),
        todo.is_completed ? "true" : "false",
        todo.due_date ?? "",
        todo.priority,
        todo.is_recurring ? "true" : "false",
        todo.recurrence_pattern,
        todo.reminder_minutes === null ? "" : String(todo.reminder_minutes),
      ].join(",")
    );

    return new NextResponse([header, ...rows].join("\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename=\"todos-${datePart}.csv\"`,
      },
    });
  }

  const allTags = tagDB.getAllByUser(session.userId).map((tag) => ({ name: tag.name, color: tag.color }));
  const payload = {
    version: "1.0",
    exportedAt: getSingaporeNow().toISOString(),
    todos: todos.map((todo) => ({
      id: todo.id,
      title: todo.title,
      priority: todo.priority,
      due_date: todo.due_date,
      is_completed: todo.is_completed,
      is_recurring: todo.is_recurring === 1,
      recurrence_pattern: todo.recurrence_pattern || null,
      reminder_minutes: todo.reminder_minutes,
      created_at: todo.created_at,
      subtasks: todo.subtasks.map((subtask) => ({
        title: subtask.title,
        is_completed: subtask.is_completed,
        position: subtask.position,
      })),
      tags: todo.tags.map((tag) => tag.name),
    })),
    tags: allTags,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename=\"todos-${datePart}.json\"`,
    },
  });
}
