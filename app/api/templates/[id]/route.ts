import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { templateDB } from "@/lib/db";

function parseTemplateId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) {
    return null;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const templateId = parseTemplateId(id);
  if (!templateId) {
    return NextResponse.json({ error: "Invalid template id" }, { status: 400 });
  }

  const deleted = templateDB.delete(templateId, session.userId);
  if (!deleted) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
