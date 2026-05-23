import { test, expect } from "@playwright/test";

test("can login and perform basic todo CRUD", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("Username").fill("e2e-user");
  await page.getByRole("button", { name: "Continue with Passkey" }).click();

  await expect(page.getByRole("heading", { name: "Todo App" })).toBeVisible();

  const uniqueTitle = `E2E todo ${Date.now()}`;
  await page.getByPlaceholder("Add todo title").fill(uniqueTitle);
  await page.getByRole("button", { name: "Add Todo" }).click();

  await expect(page.getByText(uniqueTitle)).toBeVisible();

  const todoRow = page.locator("li", { hasText: uniqueTitle });
  await todoRow.getByRole("checkbox").click();
  await page.waitForLoadState("networkidle");

  await page.locator("li", { hasText: uniqueTitle }).getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(uniqueTitle)).not.toBeVisible();
});

test("rejects empty title and past due date", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("Username").fill("e2e-validation-user");
  await page.getByRole("button", { name: "Continue with Passkey" }).click();

  await page.getByPlaceholder("Add todo title").fill("   ");
  await page.getByRole("button", { name: "Add Todo" }).click();
  await expect(page.getByText("Title is required")).toBeVisible();

  await page.getByPlaceholder("Add todo title").fill("invalid past todo");
  await page.locator("input[type='datetime-local']").fill("2000-01-01T00:00");
  await page.getByRole("button", { name: "Add Todo" }).click();
  await expect(page.getByText("Due date must be at least 1 minute in the future")).toBeVisible();
});

test("rejects enabling recurring without due date", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("Username").fill("e2e-recurring-validation-user");
  await page.getByRole("button", { name: "Continue with Passkey" }).click();
  await expect(page.getByRole("heading", { name: "Todo App" })).toBeVisible();

  const createResult = await page.evaluate(async () => {
    const response = await fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "recurring validation todo", priority: "medium" }),
    });

    const body = await response.json().catch(() => ({}));
    return { status: response.status, body };
  });

  expect(createResult.status).toBe(201);

  const updateResult = await page.evaluate(async (todoId: number) => {
    const response = await fetch(`/api/todos/${todoId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_recurring: true, due_date: null }),
    });

    const body = await response.json().catch(() => ({}));
    return { status: response.status, body };
  }, createResult.body.id as number);

  expect(updateResult.status).toBe(400);
  expect(updateResult.body.error).toBe("Recurring todos require a due date");
});
