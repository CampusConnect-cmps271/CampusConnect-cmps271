import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
import { storeLogRow, type LogRow } from "./log-store";
let server: Server, client: SupabaseClient;
const batches: LogRow[][] = [];
let active = 0, peak = 0;
function reset() {
  batches.length = 0; active = peak = 0;
  delete (globalThis as unknown as Record<symbol, unknown>)[Symbol.for("campus-connect.log-writers.v1")];
}
beforeAll(async () => {
  server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    batches.push(JSON.parse(Buffer.concat(chunks).toString()));
    active++; peak = Math.max(peak, active);
    setTimeout(() => { active--; response.writeHead(201); response.end(); }, 15);
  });
  await new Promise<void>(resolve => { server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw Error("Missing fixture port");
  client = createClient(`http://127.0.0.1:${address.port}`, "sb_secret_fixture_only", { auth: { persistSession: false, autoRefreshToken: false } });
  mocks.admin.mockReturnValue(client);
});
afterAll(async () => {
  vi.unstubAllEnvs(); reset(); server.closeAllConnections();
  await new Promise<void>(resolve => { server.close(() => resolve()); });
});
it("uses the real SDK to store 100 rows in four HTTP requests instead of 100", async () => {
  const rows: LogRow[] = Array.from({ length: 100 }, (_, i) => ({ level: "info", source: "server", event: "api.request.completed", user_id: i % 2 ? "00000000-0000-4000-8000-000000000001" : "00000000-0000-4000-8000-000000000002", message: null, created_at: new Date(1_700_000_000_000 + i).toISOString(), context: { ordinal: i } }));
  reset(); await Promise.all(rows.map(row => storeLogRow(row)));
  expect(batches).toHaveLength(4); expect(batches.flat()).toEqual(rows); expect(peak).toBe(1);
  vi.stubEnv("LOG_BATCHING_ENABLED", "false"); reset();
  await Promise.all(rows.map(row => storeLogRow(row)));
  expect(batches).toHaveLength(100); expect(batches.flat().map(row => row.context.ordinal).sort((a, b) => Number(a) - Number(b))).toEqual(rows.map(row => row.context.ordinal));
}, 10_000);
