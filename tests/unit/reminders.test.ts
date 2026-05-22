import { describe, expect, it } from "vitest";
import { getReminderBadge } from "../../lib/reminders";

describe("getReminderBadge", () => {
  it("returns empty badge for null", () => {
    expect(getReminderBadge(null)).toBe("");
  });

  it("returns short badge for known option", () => {
    expect(getReminderBadge(60)).toBe("🔔 1h");
  });

  it("falls back for unknown option", () => {
    expect(getReminderBadge(75)).toBe("🔔 75m");
  });
});
