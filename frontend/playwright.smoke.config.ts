import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke test for the live site (SCRUM-182): `npm run test:smoke`.
 *
 * Not part of CI or `npm run test:e2e`, which use playwright.config.ts and
 * mocked Supabase. This one logs in to the real deployment with the demo
 * accounts from `npm run seed:demo -- --hosted`, and creates then deletes one
 * post. Reads SMOKE_BASE_URL and the DEMO_* accounts from .env.hosted.local.
 */
try {
  process.loadEnvFile(".env.hosted.local");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

export default defineConfig({
  testDir: "./tests/smoke",
  // One journey at a time against production: no parallel logins, no retries
  // that would hide a flaky deployment.
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: "list",
  use: {
    baseURL: process.env.SMOKE_BASE_URL,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
  },
});
