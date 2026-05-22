import { test, expect } from "@playwright/test";

test.describe("feature 04 - reminders and notifications", () => {
  test("creates todo with reminder badge", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("Username").fill(`e2e-rem-${Date.now()}`);
    await page.getByRole("button", { name: /login|register|continue/i }).first().click();

    await page.getByPlaceholder("Add todo title").fill("Reminder todo");
    await page.locator("input[type='datetime-local']").fill("2026-06-01T10:00");
    await page.getByLabel("Select reminder").selectOption("60");
    await page.getByRole("button", { name: "Add Todo" }).click();

    await expect(page.getByText("🔔 1h")).toBeVisible();
  });
});
