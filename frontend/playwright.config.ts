import { defineConfig, devices } from "@playwright/test";

// Three smoke tests against a running build (see README → Tests). `npm run test:e2e` builds and
// starts the app on :3100 first. Point frontend/.env.local at a *test* Firebase project — the
// tests create guest users and a listing. Without any Firebase config they run in demo mode.
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100",
    viewport: { width: 375, height: 760 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "mobile-chromium", use: { ...devices["Pixel 7"], browserName: "chromium" } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run start -- -p 3100",
        url: "http://localhost:3100/login",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
