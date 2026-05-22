import { test, expect } from "@playwright/test";

test.describe("feature 06 - tag system", () => {
  test("creates tag and applies it to todo", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("Username").fill(`e2e-tag-${Date.now()}`);
    await page.getByRole("button", { name: /login|register|continue/i }).first().click();

    await page.getByPlaceholder("New tag").fill("Work");
    await page.getByRole("button", { name: "+ Manage Tags" }).click();

    await page.getByRole("button", { name: "Work" }).first().click();
    await page.getByPlaceholder("Add todo title").fill("Tagged Todo");
    await page.getByRole("button", { name: "Add Todo" }).click();

    await expect(page.getByText("Work")).toBeVisible();
  });
});
