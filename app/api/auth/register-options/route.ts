import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { authenticatorDB, userDB } from "@/lib/db";
import { resolveWebAuthnConfig } from "@/lib/webauthn";

const schema = z.object({
  username: z.string().trim().min(2).max(50),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Username is required" }, { status: 400 });
  }

  const username = parsed.data.username.trim().toLowerCase();
  const user = userDB.getOrCreateByUsername(username);
  const authenticators = authenticatorDB.getByUserId(user.id);
  const { rpId, rpName } = resolveWebAuthnConfig(request);

  const options = await generateRegistrationOptions({
    rpID: rpId,
    rpName,
    userName: user.username,
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
    excludeCredentials: authenticators.map((authenticator) => ({
      id: authenticator.credential_id,
    })),
  });

  userDB.updateChallenge(user.id, options.challenge);
  return NextResponse.json(options);
}
