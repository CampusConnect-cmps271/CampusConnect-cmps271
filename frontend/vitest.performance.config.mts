import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({ test: { environment: "node", include: ["tests/performance/*.bench.ts"], testTimeout: 180000, hookTimeout: 60000 },
  resolve: { alias: { "@": fileURLToPath(new URL("./",import.meta.url)) } } });
