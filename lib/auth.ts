import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getJwtSecret } from "@/lib/jwt";

const SESSION_COOKIE = "todo_session";
const SESSION_DAYS = 7;

export interface Session {
  userId: string;
  username: string;
}

interface SessionPayload {
  sub: string;
  username: string;
}

export async function createSessionToken(session: Session): Promise<string> {
  const secret = getJwtSecret();

  return new SignJWT({ username: session.username })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret);
}

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  const secret = getJwtSecret();

  try {
    const { payload } = await jwtVerify(token, secret);
    const typed = payload as unknown as SessionPayload;
    if (!typed.sub || !typed.username) {
      return null;
    }

    return {
      userId: typed.sub,
      username: typed.username,
    };
  } catch {
    return null;
  }
}

export function getSessionCookieName(): string {
  return SESSION_COOKIE;
}
