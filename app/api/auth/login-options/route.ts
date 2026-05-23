import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { authenticatorDB, userDB } from "@/lib/db";
import { RP_ID } from "@/lib/webauthn";

const schema = z.object({
  username: z.string().trim().min(2).max(50),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Username is required" }, { status: 400 });
  }

  const user = userDB.getByUsername(parsed.data.username.trim().toLowerCase());
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const authenticators = authenticatorDB.getByUserId(user.id);
  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: "preferred",
    allowCredentials: authenticators.map((authenticator) => ({
      id: authenticator.credential_id,
    })),
  });

  userDB.updateChallenge(user.id, options.challenge);
  return NextResponse.json(options);
}
