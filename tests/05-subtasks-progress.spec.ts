import { test, expect } from "@playwright/test";

test.describe("feature 05 - subtasks and progress", () => {
  test("adds subtasks and updates progress", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("Username").fill(`e2e-sub-${Date.now()}`);
    await page.getByRole("button", { name: /login|register|continue/i }).first().click();

    await page.getByPlaceholder("Add todo title").fill("Subtask Parent");
    await page.getByRole("button", { name: "Add Todo" }).click();

    await page.getByRole("button", { name: /Subtasks/ }).first().click();
    await page.getByPlaceholder("Add subtask").fill("Child step");
    await page.getByRole("button", { name: "Add" }).first().click();

    await expect(page.getByText("0/1 subtasks")).toBeVisible();
  });
});
