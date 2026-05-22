import { test, expect } from "@playwright/test";

test.describe("feature 11 - authentication webauthn", () => {
  test("shows passkey login UI", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Login" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Register" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Passkey/i })).toBeVisible();
  });
});
