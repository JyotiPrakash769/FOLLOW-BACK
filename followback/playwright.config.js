import { defineConfig, devices } from "@playwright/test";

/** Smoke tests against the built page, served over http so the service worker
 *  and worker.js load the way they do in production. */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://localhost:8080", trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node tools/serve.js",
    url: "http://localhost:8080",
    reuseExistingServer: !process.env.CI,
    timeout: 20000
  }
});
