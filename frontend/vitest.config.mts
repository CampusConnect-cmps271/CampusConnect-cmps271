import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// SCRUM-67: the planner's date and time code must not depend on the
// machine's zone, so its tests also run under UTC and Asia/Beirut.
const plannerTests = ["modules/planner/**/*.test.ts"];

export default defineConfig({
  test: {
    environment: "node",
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["lib/**/*.test.ts", "modules/**/*.test.ts", "tests/**/*.test.ts"] },
      },
      { extends: true, test: { name: "planner TZ=UTC", include: plannerTests, env: { TZ: "UTC" } } },
      { extends: true, test: { name: "planner TZ=Asia/Beirut", include: plannerTests, env: { TZ: "Asia/Beirut" } } },
    ],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
});
