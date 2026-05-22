import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { holidayDB } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const year = Number.parseInt(url.searchParams.get("year") || "", 10);
  const month = Number.parseInt(url.searchParams.get("month") || "", 10);

  if (!Number.isSafeInteger(year) || !Number.isSafeInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "Invalid year/month" }, { status: 400 });
  }

  return NextResponse.json(holidayDB.getByMonth(year, month));
}
