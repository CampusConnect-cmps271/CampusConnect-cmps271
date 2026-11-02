import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Only the retrieval evaluation, which needs a running local Supabase and a Gemini key.
// `npm test` never runs it: vitest.config.mts includes only *.test.ts files.
export default defineConfig({
  test: {
    environment: "node",
    include: ["modules/**/*.eval.ts"],
    testTimeout: 600_000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
});
