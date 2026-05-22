import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { tagDB, todoDB } from "@/lib/db";

function parseTodoId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) {
    return null;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  return NextResponse.json(tagDB.getByTodoId(todoId, session.userId));
}
