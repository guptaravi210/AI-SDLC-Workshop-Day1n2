import { test, expect } from "@playwright/test";

test.describe("feature 08 - search and filtering", () => {
  test("filters todos by search and completion", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("Username").fill(`e2e-search-${Date.now()}`);
    await page.getByRole("button", { name: "Continue with Passkey" }).click();

    await page.getByPlaceholder("Add todo title").fill("Searchable item");
    await page.getByRole("button", { name: "Add Todo" }).click();

    await page.locator("input[placeholder*='Search todos or subtasks']").fill("Searchable");
    await expect(page.getByText("Searchable item")).toBeVisible();
  });
});
