import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { authenticatorDB, userDB } from "@/lib/db";
import { createSessionToken, getSessionCookieName } from "@/lib/auth";
import { resolveWebAuthnConfig } from "@/lib/webauthn";

const schema = z.object({
  username: z.string().trim().min(2).max(50),
  response: z.any(),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const username = parsed.data.username.trim().toLowerCase();
  const user = userDB.getByUsername(username);
  if (!user || !user.challenge) {
    return NextResponse.json({ error: "Login not initialized" }, { status: 400 });
  }

  const credentialId = parsed.data.response?.id;
  if (typeof credentialId !== "string") {
    return NextResponse.json({ error: "Invalid credential" }, { status: 400 });
  }

  const authenticator = authenticatorDB.getByCredentialId(credentialId);
  if (!authenticator || authenticator.user_id !== user.id) {
    return NextResponse.json({ error: "Authenticator not found" }, { status: 400 });
  }

  const { rpId, rpOrigin } = resolveWebAuthnConfig(request);

  const verification = await verifyAuthenticationResponse({
    response: parsed.data.response,
    expectedChallenge: user.challenge,
    expectedOrigin: rpOrigin,
    expectedRPID: rpId,
    credential: {
      id: authenticator.credential_id,
      publicKey: isoBase64URL.toBuffer(authenticator.credential_public_key),
      counter: authenticator.counter ?? 0,
    },
  }).catch(() => null);

  if (!verification?.verified) {
    return NextResponse.json({ error: "Login verification failed" }, { status: 400 });
  }

  authenticatorDB.updateCounter(authenticator.credential_id, verification.authenticationInfo.newCounter ?? 0);
  userDB.clearChallenge(user.id);

  const token = await createSessionToken({ userId: user.id, username: user.username });
  const response = NextResponse.json({ verified: true });
  response.cookies.set(getSessionCookieName(), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return response;
}
