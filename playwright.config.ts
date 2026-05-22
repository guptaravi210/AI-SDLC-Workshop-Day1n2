import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: ["**/*.spec.ts"],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    timezoneId: "Asia/Singapore",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    env: {
      JWT_SECRET: "playwright-e2e-secret",
      ENABLE_DEV_LOGIN: "true",
    },
  },
});
