const NON_PROD_FALLBACK_SECRET = "local-dev-secret-change-me";

export function getJwtSecret(): Uint8Array {
  const configured = process.env.JWT_SECRET;
  if (configured) {
    return new TextEncoder().encode(configured);
  }

  if (process.env.NODE_ENV === "test") {
    return new TextEncoder().encode(NON_PROD_FALLBACK_SECRET);
  }

  throw new Error("JWT_SECRET must be configured");
}
