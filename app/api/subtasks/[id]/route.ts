import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { subtaskDB, todoDB } from "@/lib/db";

const updateSubtaskSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  is_completed: z.boolean().optional(),
});

function parseSubtaskId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) {
    return null;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const subtaskId = parseSubtaskId(id);
  if (!subtaskId) {
    return NextResponse.json({ error: "Invalid subtask id" }, { status: 400 });
  }

  const subtask = subtaskDB.getById(subtaskId);
  if (!subtask) {
    return NextResponse.json({ error: "Subtask not found" }, { status: 404 });
  }

  const todo = todoDB.getById(subtask.todo_id, session.userId);
  if (!todo) {
    return NextResponse.json({ error: "Subtask not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateSubtaskSchema.safeParse(body);
  if (!parsed.success || (parsed.data.title === undefined && parsed.data.is_completed === undefined)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const updated = subtaskDB.update(subtaskId, {
    title: parsed.data.title,
    is_completed: parsed.data.is_completed === undefined ? undefined : parsed.data.is_completed ? 1 : 0,
  });

  return NextResponse.json(updated);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const subtaskId = parseSubtaskId(id);
  if (!subtaskId) {
    return NextResponse.json({ error: "Invalid subtask id" }, { status: 400 });
  }

  const subtask = subtaskDB.getById(subtaskId);
  if (!subtask) {
    return NextResponse.json({ error: "Subtask not found" }, { status: 404 });
  }

  const todo = todoDB.getById(subtask.todo_id, session.userId);
  if (!todo) {
    return NextResponse.json({ error: "Subtask not found" }, { status: 404 });
  }

  const deleted = subtaskDB.delete(subtaskId);
  return NextResponse.json({ success: deleted });
}
