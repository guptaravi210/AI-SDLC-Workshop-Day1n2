import { isoBase64URL } from "@simplewebauthn/server/helpers";

export const RP_ID = process.env.RP_ID || "localhost";
export const RP_NAME = process.env.RP_NAME || "Todo App";
export const RP_ORIGIN = process.env.RP_ORIGIN || "http://localhost:3000";

export function toBase64Url(buffer: Uint8Array): string {
  return isoBase64URL.fromBuffer(Buffer.from(buffer));
}

export function fromBase64Url(value: string): Uint8Array {
  return isoBase64URL.toBuffer(value);
}
