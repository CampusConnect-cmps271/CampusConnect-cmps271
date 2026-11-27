import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: "**/catalogue-cache.spec.ts",
  fullyParallel: false,
  workers: 1,
  webServer: (Array.isArray(base.webServer) ? base.webServer : []).map((server) => ({
    ...server,
    env: { ...server.env, COURSE_CATALOGUE_CACHE_ENABLED: "true" },
  })),
});
