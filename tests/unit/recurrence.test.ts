import { describe, expect, it } from "vitest";
import { calculateNextRecurringDueDate } from "../../lib/todo-helpers";

describe("calculateNextRecurringDueDate", () => {
  it("calculates daily recurrence", () => {
    const next = calculateNextRecurringDueDate("2025-01-01T09:00:00.000Z", "daily");
    expect(next).toBe("2025-01-02T09:00:00.000Z");
  });

  it("calculates weekly recurrence", () => {
    const next = calculateNextRecurringDueDate("2025-01-01T09:00:00.000Z", "weekly");
    expect(next).toBe("2025-01-08T09:00:00.000Z");
  });

  it("handles end-of-month for monthly recurrence", () => {
    const next = calculateNextRecurringDueDate("2025-01-31T09:00:00.000Z", "monthly");
    expect(next).toBe("2025-02-28T09:00:00.000Z");
  });

  it("handles leap-year rollover for yearly recurrence", () => {
    const next = calculateNextRecurringDueDate("2024-02-29T09:00:00.000Z", "yearly");
    expect(next).toBe("2025-02-28T09:00:00.000Z");
  });
});
