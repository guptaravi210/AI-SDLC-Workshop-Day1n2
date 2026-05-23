import { test, expect } from "@playwright/test";

async function createTodo(page: import("@playwright/test").Page, title: string, priority?: "high" | "medium" | "low") {
  await page.getByPlaceholder("Add todo title").fill(title);
  if (priority) {
    await page.getByLabel("Select priority").selectOption(priority);
  }
  await page.getByRole("button", { name: "Add Todo" }).click();
  await expect(page.getByText(title)).toBeVisible();
}

test.describe("feature 02 - priority system", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    const username = `e2e-priority-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await page.getByPlaceholder("Username").fill(username);
    await page.getByRole("button", { name: "Continue with Passkey" }).click();
    await expect(page.getByRole("heading", { name: "Todo App" })).toBeVisible();
  });

  test("defaults to medium priority and shows badge", async ({ page }) => {
    const title = `default priority todo ${Date.now()}`;
    await createTodo(page, title);

    const row = page.locator("li", { hasText: title }).first();
    await expect(row.getByLabel("Priority: Medium")).toBeVisible();
  });

  test("sorts active todos by high, medium, low", async ({ page }) => {
    const suffix = Date.now();
    const lowTitle = `low task ${suffix}`;
    const highTitle = `high task ${suffix}`;
    const mediumTitle = `medium task ${suffix}`;

    await createTodo(page, lowTitle, "low");
    await createTodo(page, highTitle, "high");
    await createTodo(page, mediumTitle, "medium");

    const activeSection = page.getByRole("heading", { name: /active \(/i }).locator("..");
    const activeItems = await activeSection.locator("li p:first-child").allTextContents();
    const matching = activeItems.filter((value) => value.includes(String(suffix)));

    expect(matching).toEqual([highTitle, mediumTitle, lowTitle]);
  });

  test("filters by selected priority", async ({ page }) => {
    const suffix = Date.now();
    const highTitle = `high only task ${suffix}`;
    const mediumTitle = `medium hidden task ${suffix}`;

    await createTodo(page, highTitle, "high");
    await createTodo(page, mediumTitle, "medium");

    await page.getByLabel("Filter by priority").selectOption("high");

    await expect(page.getByText(highTitle)).toBeVisible();
    await expect(page.getByText(mediumTitle)).not.toBeVisible();

    await page.getByLabel("Filter by priority").selectOption("all");
    await expect(page.getByText(mediumTitle)).toBeVisible();
  });
});
