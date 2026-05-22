import { describe, expect, it } from "vitest";
import { parseDateInSingapore } from "../../lib/timezone";

describe("parseDateInSingapore", () => {
  it("parses local datetime strings as Singapore time", () => {
    const parsed = parseDateInSingapore("2025-01-01T08:30");
    expect(parsed?.toISOString()).toBe("2025-01-01T00:30:00.000Z");
  });

  it("preserves explicit timezone offsets", () => {
    const parsed = parseDateInSingapore("2025-01-01T08:30:00+09:00");
    expect(parsed?.toISOString()).toBe("2024-12-31T23:30:00.000Z");
  });

  it("accepts explicit UTC timestamps", () => {
    const parsed = parseDateInSingapore("2025-01-01T08:30:00.123Z");
    expect(parsed?.toISOString()).toBe("2025-01-01T08:30:00.123Z");
  });

  it("rejects impossible calendar dates", () => {
    expect(parseDateInSingapore("2025-02-30T10:00")).toBeNull();
  });

  it("returns null for invalid date strings", () => {
    expect(parseDateInSingapore("invalid")).toBeNull();
  });
});
