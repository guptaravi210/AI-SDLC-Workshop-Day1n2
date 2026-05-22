import { describe, expect, it } from "vitest";
import { calculateProgress, isAnyFilterActive } from "../../lib/todo-helpers";

describe("calculateProgress", () => {
  it("returns zero for empty subtasks", () => {
    expect(calculateProgress([])).toBe(0);
  });

  it("calculates percentage progress", () => {
    expect(calculateProgress([{ is_completed: 1 }, { is_completed: 0 }, { is_completed: 1 }])).toBe(67);
  });
});

describe("isAnyFilterActive", () => {
  it("detects no active filters", () => {
    expect(
      isAnyFilterActive({
        searchQuery: "",
        priority: "all",
        tagId: "all",
        completion: "all",
        dueDateFrom: "",
        dueDateTo: "",
      })
    ).toBe(false);
  });

  it("detects active search filter", () => {
    expect(
      isAnyFilterActive({
        searchQuery: "project",
        priority: "all",
        tagId: "all",
        completion: "all",
        dueDateFrom: "",
        dueDateTo: "",
      })
    ).toBe(true);
  });
});
