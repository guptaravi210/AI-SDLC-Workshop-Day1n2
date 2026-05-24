import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { authenticatorDB, userDB } from "@/lib/db";
import { createSessionToken, getSessionCookieName } from "@/lib/auth";
import { resolveWebAuthnVerificationConfig } from "@/lib/webauthn";

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

  const user = userDB.getByUsername(parsed.data.username.trim().toLowerCase());
  if (!user || !user.challenge) {
    return NextResponse.json({ error: "Registration not initialized" }, { status: 400 });
  }

  const { rpIds, origins } = resolveWebAuthnVerificationConfig(request);

  const verification = await verifyRegistrationResponse({
    response: parsed.data.response,
    expectedChallenge: user.challenge,
    expectedOrigin: origins,
    expectedRPID: rpIds,
  }).catch(() => null);

  if (!verification?.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: "Registration verification failed" }, { status: 400 });
  }

  const credential = verification.registrationInfo.credential;
  const credentialId = credential.id;
  const existing = authenticatorDB.getByCredentialId(credentialId);

  if (!existing) {
    authenticatorDB.create({
      credential_id: credentialId,
      user_id: user.id,
      credential_public_key: isoBase64URL.fromBuffer(credential.publicKey),
      counter: credential.counter ?? 0,
      transports: JSON.stringify(parsed.data.response.response?.transports ?? []),
    });
  }

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
