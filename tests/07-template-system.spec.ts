import { test, expect } from "@playwright/test";

test.describe("feature 07 - template system", () => {
  test("saves and uses template", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("Username").fill(`e2e-template-${Date.now()}`);
    await page.getByRole("button", { name: /login|register|continue/i }).first().click();

    await page.getByPlaceholder("Add todo title").fill("Weekly Review");
    await page.getByPlaceholder("Template name").fill("Review Template");
    await page.getByRole("button", { name: "💾 Save as Template" }).click();

    await page.locator("select").filter({ hasText: "Use Template" }).selectOption({ label: "Review Template" });
    await expect(page.getByText("Weekly Review")).toHaveCount(2);
  });
});
