import { test, expect } from "@playwright/test";

test.describe("feature 03 - recurring todos", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    const username = `e2e-recurring-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await page.getByPlaceholder("Username").fill(username);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Todo App" })).toBeVisible();
  });

  test("creates recurring todo with visible recurring badge", async ({ page }) => {
    const title = `daily recurring ${Date.now()}`;
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const local = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(
      future.getDate()
    ).padStart(2, "0")}T${String(future.getHours()).padStart(2, "0")}:${String(future.getMinutes()).padStart(
      2,
      "0"
    )}`;

    await page.getByPlaceholder("Add todo title").fill(title);
    await page.getByLabel("Select priority").selectOption("high");
    await page.locator("input[type='datetime-local']").fill(local);
    await page.getByLabel("Repeat").check();
    await page.getByLabel("Select recurrence pattern").selectOption("daily");
    await page.getByRole("button", { name: "Add Todo" }).click();

    const row = page.locator("li", { hasText: title }).first();
    await expect(row.getByText("↻ daily")).toBeVisible();
  });

  test("completing recurring todo generates next instance with inherited metadata", async ({ page }) => {
    const createResult = await page.evaluate(async () => {
      const now = new Date(Date.now() + 6 * 60 * 60 * 1000);
      const response = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "weekly recurrence inheritance",
          priority: "high",
          due_date: now.toISOString(),
          is_recurring: true,
          recurrence_pattern: "weekly",
          reminder_minutes: 30,
        }),
      });

      const body = await response.json();
      return { status: response.status, body };
    });

    expect(createResult.status).toBe(201);

    const updateResult = await page.evaluate(async (todoId: number) => {
      const response = await fetch(`/api/todos/${todoId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_completed: true }),
      });

      const body = await response.json();
      return { status: response.status, body };
    }, createResult.body.id as number);

    expect(updateResult.status).toBe(200);
    expect(updateResult.body.nextInstance).not.toBeNull();
    expect(updateResult.body.nextInstance.title).toBe("weekly recurrence inheritance");
    expect(updateResult.body.nextInstance.priority).toBe("high");
    expect(updateResult.body.nextInstance.is_recurring).toBe(1);
    expect(updateResult.body.nextInstance.recurrence_pattern).toBe("weekly");
    expect(updateResult.body.nextInstance.reminder_minutes).toBe(30);

    await page.reload();
    await expect(page.getByText("weekly recurrence inheritance")).toHaveCount(2);
  });

  test("repeated completion requests do not create duplicate next instances", async ({ page }) => {
    const createResult = await page.evaluate(async () => {
      const now = new Date(Date.now() + 5 * 60 * 60 * 1000);
      const response = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "duplicate-guard recurrence",
          priority: "medium",
          due_date: now.toISOString(),
          is_recurring: true,
          recurrence_pattern: "daily",
        }),
      });

      return { status: response.status, body: await response.json() };
    });

    expect(createResult.status).toBe(201);

    const todoId = createResult.body.id as number;
    const completionResults = await page.evaluate(async (id: number) => {
      const payload = {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_completed: true }),
      };

      const [first, second] = await Promise.all([fetch(`/api/todos/${id}`, payload), fetch(`/api/todos/${id}`, payload)]);

      return {
        firstStatus: first.status,
        secondStatus: second.status,
      };
    }, todoId);

    expect(completionResults.firstStatus).toBe(200);
    expect(completionResults.secondStatus).toBe(200);

    const listResult = await page.evaluate(async () => {
      const response = await fetch("/api/todos");
      const todos = await response.json();
      return todos.filter((todo: { title: string }) => todo.title === "duplicate-guard recurrence").length;
    });

    expect(listResult).toBe(2);
  });
});
