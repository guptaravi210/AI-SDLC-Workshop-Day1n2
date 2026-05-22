import { describe, expect, it } from "vitest";
import { isDueDateValid, sortTodos } from "../../lib/todo-helpers";
import { getSingaporeNow } from "../../lib/timezone";

describe("isDueDateValid", () => {
  it("rejects invalid date strings", () => {
    expect(isDueDateValid("not-a-date")).toBe(false);
  });

  it("rejects past dates", () => {
    expect(isDueDateValid("2000-01-01T00:00:00.000Z")).toBe(false);
  });

  it("accepts future dates", () => {
    const future = new Date(getSingaporeNow().getTime() + 5 * 60 * 1000).toISOString();
    expect(isDueDateValid(future)).toBe(true);
  });
});

describe("sortTodos", () => {
  it("sorts by priority, then due date, then created_at desc", () => {
    const todos = [
      {
        priority: "medium" as const,
        due_date: null,
        created_at: "2025-01-01T00:00:00.000Z",
      },
      {
        priority: "high" as const,
        due_date: "2025-01-02T00:00:00.000Z",
        created_at: "2025-01-01T00:00:00.000Z",
      },
      {
        priority: "high" as const,
        due_date: "2025-01-01T00:00:00.000Z",
        created_at: "2025-01-01T00:00:00.000Z",
      },
    ];

    const sorted = sortTodos(todos);
    expect(sorted[0].due_date).toBe("2025-01-01T00:00:00.000Z");
    expect(sorted[1].due_date).toBe("2025-01-02T00:00:00.000Z");
    expect(sorted[2].priority).toBe("medium");
  });

  it("keeps high before medium before low regardless of due date", () => {
    const todos = [
      {
        priority: "low" as const,
        due_date: "2025-01-01T00:00:00.000Z",
        created_at: "2025-01-01T00:00:00.000Z",
      },
      {
        priority: "medium" as const,
        due_date: "2025-01-01T00:00:00.000Z",
        created_at: "2025-01-01T00:00:00.000Z",
      },
      {
        priority: "high" as const,
        due_date: "2025-12-31T00:00:00.000Z",
        created_at: "2025-01-01T00:00:00.000Z",
      },
    ];

    const sorted = sortTodos(todos);
    expect(sorted.map((todo) => todo.priority)).toEqual(["high", "medium", "low"]);
  });

  it("uses created_at descending when priority and due date are equal", () => {
    const todos = [
      {
        priority: "medium" as const,
        due_date: "2025-01-01T00:00:00.000Z",
        created_at: "2025-01-01T00:00:00.000Z",
      },
      {
        priority: "medium" as const,
        due_date: "2025-01-01T00:00:00.000Z",
        created_at: "2025-02-01T00:00:00.000Z",
      },
    ];

    const sorted = sortTodos(todos);
    expect(sorted[0].created_at).toBe("2025-02-01T00:00:00.000Z");
    expect(sorted[1].created_at).toBe("2025-01-01T00:00:00.000Z");
  });
});
