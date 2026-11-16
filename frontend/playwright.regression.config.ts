import { defineConfig } from "@playwright/test";
import mainConfig from "./playwright.config";

/**
 * SP4-31 / SCRUM-273: focused, repeatable browser regression suite.
 *
 * Reuse the same mocked Supabase, Chromium configuration, and Next.js server
 * as the existing E2E tests. Selecting the proven journey specs avoids
 * duplicating tests or introducing another test environment.
 *
 * Community and messaging journeys each manage their own serial fixtures.
 */
export default defineConfig(mainConfig, {
  testMatch: /[\\/](?:account-pages|community-journey|courses|messaging)\.spec\.ts$/,
});
