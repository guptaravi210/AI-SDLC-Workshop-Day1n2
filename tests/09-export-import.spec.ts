import { test, expect } from "@playwright/test";

test.describe("feature 09 - export import", () => {
  test("exports and imports todos via API", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("Username").fill(`e2e-export-${Date.now()}`);
    await page.getByRole("button", { name: "Continue with Passkey" }).click();

    await page.getByPlaceholder("Add todo title").fill("Exportable Todo");
    await page.getByRole("button", { name: "Add Todo" }).click();

    const exportResponse = await page.request.get("/api/todos/export");
    expect(exportResponse.ok()).toBeTruthy();

    const exported = await exportResponse.json();
    const importResponse = await page.request.post("/api/todos/import", { data: exported });
    expect(importResponse.ok()).toBeTruthy();
  });
});
