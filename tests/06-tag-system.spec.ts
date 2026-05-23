import { test, expect } from "@playwright/test";

test.describe("feature 06 - tag system", () => {
  test("creates tag and applies it to todo", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("Username").fill(`e2e-tag-${Date.now()}`);
    await page.getByRole("button", { name: "Continue with Passkey" }).click();

    await page.getByPlaceholder("New tag").fill("Work");
    await page.getByRole("button", { name: "+ Manage Tags" }).click();

    await page.getByRole("button", { name: "Work" }).first().click();
    const title = `Tagged Todo ${Date.now()}`;
    await page.getByPlaceholder("Add todo title").fill(title);
    await page.getByRole("button", { name: "Add Todo" }).click();

    const todoRow = page.locator("li", { hasText: title }).first();
    await expect(todoRow.getByRole("button", { name: "Work", exact: true })).toBeVisible();
  });
});
