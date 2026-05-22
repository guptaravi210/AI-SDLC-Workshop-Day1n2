import { describe, expect, it } from "vitest";
import { createSessionToken } from "../../lib/auth";

describe("auth session token", () => {
  it("creates signed session token", async () => {
    const token = await createSessionToken({ userId: "user-1", username: "alice" });
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3);
  });
});
