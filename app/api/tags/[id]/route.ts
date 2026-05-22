import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { tagDB } from "@/lib/db";

const updateTagSchema = z.object({
  name: z.string().trim().min(1).max(30).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

function parseTagId(raw: string): number | null {
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
  const tagId = parseTagId(id);
  if (!tagId) {
    return NextResponse.json({ error: "Invalid tag id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateTagSchema.safeParse(body);
  if (!parsed.success || (parsed.data.name === undefined && parsed.data.color === undefined)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (parsed.data.name) {
    const existing = tagDB.getByName(session.userId, parsed.data.name);
    if (existing && existing.id !== tagId) {
      return NextResponse.json({ error: "A tag with this name already exists" }, { status: 409 });
    }
  }

  const updated = tagDB.update(tagId, session.userId, parsed.data);
  if (!updated) {
    return NextResponse.json({ error: "Tag not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const tagId = parseTagId(id);
  if (!tagId) {
    return NextResponse.json({ error: "Invalid tag id" }, { status: 400 });
  }

  const deleted = tagDB.delete(tagId, session.userId);
  if (!deleted) {
    return NextResponse.json({ error: "Tag not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
