import { test, expect } from "@playwright/test";

test.describe("feature 05 - subtasks and progress", () => {
  test("adds subtasks and updates progress", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("Username").fill(`e2e-sub-${Date.now()}`);
    await page.getByRole("button", { name: "Continue with Passkey" }).click();

    const title = `Subtask Parent ${Date.now()}`;
    await page.getByPlaceholder("Add todo title").fill(title);
    await page.getByRole("button", { name: "Add Todo" }).click();

    const todoRow = page.locator("li", { hasText: title }).first();
    await todoRow.getByRole("button", { name: /Subtasks/ }).click();
    await todoRow.getByPlaceholder("Add subtask").fill("Child step");
    await todoRow.getByRole("button", { name: "Add", exact: true }).click();

    await expect(page.getByText("0/1 subtasks")).toBeVisible({ timeout: 10000 });
  });
});
