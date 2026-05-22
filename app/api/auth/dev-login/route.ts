import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSessionToken, getSessionCookieName } from "@/lib/auth";
import { userDB } from "@/lib/db";

const loginSchema = z.object({
  username: z.string().trim().min(2).max(50),
});

export async function POST(request: NextRequest) {
  const isEnabled = process.env.ENABLE_DEV_LOGIN === "true";
  if (process.env.NODE_ENV !== "development" || !isEnabled) {
    return NextResponse.json({ error: "Endpoint is disabled" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Username is required" }, { status: 400 });
  }

  const user = userDB.getOrCreateByUsername(parsed.data.username.trim().toLowerCase());
  const token = await createSessionToken({
    userId: user.id,
    username: user.username,
  });

  const response = NextResponse.json({ success: true, user: { id: user.id, username: user.username } });
  response.cookies.set(getSessionCookieName(), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return response;
}
