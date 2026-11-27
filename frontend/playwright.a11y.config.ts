import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

/**
 * Accessibility scans (SCRUM-312): `npm run test:a11y`.
 *
 * Runs tests/a11y in two browser engines, Chromium and Firefox, against the
 * same mocked-Supabase servers as the regular e2e suite. It is separate from
 * playwright.config.ts so that suite does not double in length. Set
 * PLAYWRIGHT_CHANNEL=chrome to use an installed Chrome instead of Playwright's
 * Chromium build.
 */
export default defineConfig({
  ...base,
  testDir: "./tests/a11y",
  // Each test already loops over several pages and viewports.
  workers: 1,
  timeout: 300_000,
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) },
    },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
  ],
});
