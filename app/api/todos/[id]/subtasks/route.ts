import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { subtaskDB, todoDB } from "@/lib/db";

const createSubtaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

function parseTodoId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) {
    return null;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  return NextResponse.json(subtaskDB.getByTodoId(todoId));
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const body = await request.json().catch(() => null);
  const parsed = createSubtaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Subtask title is required" }, { status: 400 });
  }

  const subtask = subtaskDB.create(todoId, parsed.data.title);
  return NextResponse.json(subtask, { status: 201 });
}
