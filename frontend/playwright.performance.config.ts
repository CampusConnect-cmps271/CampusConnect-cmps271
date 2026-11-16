import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
// Run after a fixture-configured production build; checks the same build used by test:load:local.
const servers = Array.isArray(base.webServer) ? base.webServer : [];
export default defineConfig({
  ...base,
  testMatch: ["performance.spec.ts", "elective-offerings.spec.ts"],
  webServer: [servers[0], { ...servers[1], command: "npm run start -- --hostname 127.0.0.1 --port 3100" }],
});
