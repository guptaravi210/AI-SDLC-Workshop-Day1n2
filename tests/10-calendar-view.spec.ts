import { test, expect } from "@playwright/test";

test.describe("feature 10 - calendar view", () => {
  test("opens calendar and navigates months", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("Username").fill(`e2e-cal-${Date.now()}`);
    await page.getByRole("button", { name: "Continue with Passkey" }).click();

    await page.getByRole("link", { name: "Calendar" }).click();
    await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Prev", exact: true }).click();
  });
});
