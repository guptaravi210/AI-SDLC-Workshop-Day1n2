import { isoBase64URL } from "@simplewebauthn/server/helpers";
import type { NextRequest } from "next/server";

export const RP_ID = process.env.RP_ID || "localhost";
export const RP_NAME = process.env.RP_NAME || "Todo App";
export const RP_ORIGIN = process.env.RP_ORIGIN || "http://localhost:3000";

export function resolveWebAuthnConfig(request?: NextRequest): {
  rpId: string;
  rpName: string;
  rpOrigin: string;
} {
  const rpName = process.env.RP_NAME || RP_NAME;

  if (process.env.RP_ID && process.env.RP_ORIGIN) {
    return {
      rpId: process.env.RP_ID,
      rpName,
      rpOrigin: process.env.RP_ORIGIN,
    };
  }

  if (request) {
    const origin = request.nextUrl.origin;
    const host = request.nextUrl.hostname;

    return {
      rpId: process.env.RP_ID || host,
      rpName,
      rpOrigin: process.env.RP_ORIGIN || origin,
    };
  }

  return {
    rpId: RP_ID,
    rpName,
    rpOrigin: RP_ORIGIN,
  };
}

export function toBase64Url(buffer: Uint8Array): string {
  return isoBase64URL.fromBuffer(Buffer.from(buffer));
}

export function fromBase64Url(value: string): Uint8Array {
  return isoBase64URL.toBuffer(value);
}
