import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getSingaporeNow } from "@/lib/timezone";
import { todoDB } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const nowIso = getSingaporeNow().toISOString();
  const todos = todoDB.getDueNotifications(session.userId, nowIso);
  todoDB.markNotificationsSent(
    todos.map((todo) => todo.id),
    nowIso
  );

  return NextResponse.json({ todos });
}
