import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { tagDB } from "@/lib/db";

const tagSchema = z.object({
  name: z.string().trim().min(1).max(30),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
});

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  return NextResponse.json(tagDB.getAllByUser(session.userId));
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = tagSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const existing = tagDB.getByName(session.userId, parsed.data.name);
  if (existing) {
    return NextResponse.json({ error: "A tag with this name already exists" }, { status: 409 });
  }

  const tag = tagDB.create(session.userId, parsed.data.name, parsed.data.color);
  return NextResponse.json(tag, { status: 201 });
}
