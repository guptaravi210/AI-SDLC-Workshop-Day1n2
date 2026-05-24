import { isoBase64URL } from "@simplewebauthn/server/helpers";
import type { NextRequest } from "next/server";

export const RP_ID = process.env.RP_ID || "localhost";
export const RP_NAME = process.env.RP_NAME || "Todo App";
export const RP_ORIGIN = process.env.RP_ORIGIN || "http://localhost:3000";

function isLocalHostValue(value: string): boolean {
  return value === "localhost" || value === "127.0.0.1";
}

function isLocalOrigin(value: string): boolean {
  return value.includes("://localhost") || value.includes("://127.0.0.1");
}

export function resolveWebAuthnConfig(request?: NextRequest): {
  rpId: string;
  rpName: string;
  rpOrigin: string;
} {
  const rpName = process.env.RP_NAME || RP_NAME;

  const configuredRpId = process.env.RP_ID?.trim();
  const configuredRpOrigin = process.env.RP_ORIGIN?.trim();

  const requestHost = request?.nextUrl.hostname;
  const requestOrigin = request?.nextUrl.origin;

  const shouldUseConfiguredRpId =
    !!configuredRpId && !(requestHost && !isLocalHostValue(requestHost) && isLocalHostValue(configuredRpId));
  const shouldUseConfiguredRpOrigin =
    !!configuredRpOrigin && !(requestOrigin && !isLocalOrigin(requestOrigin) && isLocalOrigin(configuredRpOrigin));

  const rpId = shouldUseConfiguredRpId ? configuredRpId! : requestHost || RP_ID;
  const rpOrigin = shouldUseConfiguredRpOrigin ? configuredRpOrigin! : requestOrigin || RP_ORIGIN;

  return {
    rpId,
    rpName,
    rpOrigin,
  };
}

export function toBase64Url(buffer: Uint8Array): string {
  return isoBase64URL.fromBuffer(Buffer.from(buffer));
}

export function fromBase64Url(value: string): Uint8Array {
  return isoBase64URL.toBuffer(value);
}
