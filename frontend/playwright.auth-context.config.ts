import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: "**/auth-context.spec.ts",
  fullyParallel: false,
  workers: 1,
  webServer: (Array.isArray(base.webServer) ? base.webServer : []).map(server => ({
    ...server,
    env: {...server.env, AUTH_LIVE_CONTEXT_ENABLED:"true", AUTH_TEST_ASYMMETRIC:"true", COURSE_TRACING_ENABLED:"true", COURSE_TRACE_SAMPLE_RATE:"1", COURSE_TRACE_PERSIST_ENABLED:"false"},
  })),
});
