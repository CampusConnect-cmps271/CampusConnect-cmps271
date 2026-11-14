import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({test:{environment:"node",include:["tests/performance/upstash.live.ts"],testTimeout:20000},resolve:{alias:{"@":fileURLToPath(new URL("./",import.meta.url))}}});
