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

function normalizeHost(raw: string | null | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }

  const first = raw.split(",")[0]?.trim();
  if (!first) {
    return undefined;
  }

  const withoutScheme = first.replace(/^https?:\/\//, "");

  if (withoutScheme.startsWith("[")) {
    const ipv6End = withoutScheme.indexOf("]");
    return ipv6End > 0 ? withoutScheme.slice(1, ipv6End) : withoutScheme;
  }

  return withoutScheme.split(":")[0]?.trim() || undefined;
}

function normalizeProto(raw: string | null | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }

  const first = raw.split(",")[0]?.trim().toLowerCase();
  if (first === "http" || first === "https") {
    return first;
  }

  return undefined;
}

export function resolveWebAuthnConfig(request?: NextRequest): {
  rpId: string;
  rpName: string;
  rpOrigin: string;
} {
  const rpName = process.env.RP_NAME || RP_NAME;

  const configuredRpId = process.env.RP_ID?.trim();
  const configuredRpOrigin = process.env.RP_ORIGIN?.trim();

  const requestHost = request
    ? normalizeHost(request.headers.get("x-forwarded-host")) ||
      normalizeHost(request.headers.get("host")) ||
      request.nextUrl.hostname
    : undefined;

  const requestProto = request
    ? normalizeProto(request.headers.get("x-forwarded-proto")) || request.nextUrl.protocol.replace(":", "")
    : undefined;

  const requestOrigin = requestHost && requestProto ? `${requestProto}://${requestHost}` : undefined;

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
