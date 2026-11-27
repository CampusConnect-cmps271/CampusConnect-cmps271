import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ insert: vi.fn(), abort: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => ({ insert: mocks.insert }) }) }));
import { storeLogRow, type LogRow } from "./log-store";
const row = (event = "api.request.completed"): LogRow => ({ level: "info", source: "server", event, user_id: null, message: null, context: {}, created_at: "2026-11-27T20:00:00Z" });
afterEach(() => {
  vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.clearAllMocks();
  delete (globalThis as unknown as Record<symbol, unknown>)[Symbol.for("campus-connect.log-writers.v1")];
});
it("batches routine rows with their timestamps and bounds HTTP writes", async () => {
  mocks.abort.mockResolvedValue({ error: null }); mocks.insert.mockReturnValue({ abortSignal: mocks.abort });
  const timeout = vi.spyOn(AbortSignal, "timeout");
  const rows = [row(), { ...row(), created_at: "2026-11-27T20:00:01Z" }, row()];
  await Promise.all(rows.map(value => storeLogRow(value)));
  expect(mocks.insert).toHaveBeenCalledTimes(1); expect(mocks.insert).toHaveBeenCalledWith(rows);
  expect(timeout).toHaveBeenCalledWith(10000);
});
it("keeps diagnostic writes independent with their shorter timeout", async () => {
  let release!: (value: { error: null }) => void;
  mocks.abort.mockImplementationOnce(() => new Promise(resolve => { release = resolve; })).mockResolvedValue({ error: null });
  mocks.insert.mockReturnValue({ abortSignal: mocks.abort });
  const timeout = vi.spyOn(AbortSignal, "timeout");
  const routine = storeLogRow(row()); await Promise.resolve(); await Promise.resolve();
  await storeLogRow(row("performance.course_request"), "diagnostic");
  expect(timeout).toHaveBeenCalledWith(1000); expect(mocks.insert).toHaveBeenCalledTimes(2);
  release({ error: null }); await routine;
});
it("supports a direct-write comparison without dropping rows", async () => {
  vi.stubEnv("LOG_BATCHING_ENABLED", "false");
  mocks.abort.mockResolvedValue({ error: null }); mocks.insert.mockReturnValue({ abortSignal: mocks.abort });
  await Promise.all([storeLogRow(row()), storeLogRow(row())]);
  expect(mocks.insert).toHaveBeenCalledTimes(2);
});
it("does not let an invalid UUID discard valid rows in the batch", async () => {
  mocks.insert.mockImplementation((rows: LogRow[]) => ({ abortSignal: async () => ({ error: rows.some(value => value.user_id === "invalid") ? { code: "22P02", message: "invalid UUID" } : null }) }));
  const results = await Promise.allSettled([storeLogRow(row()), storeLogRow({ ...row(), user_id: "invalid" }), storeLogRow(row())]);
  expect(results.map(result => result.status)).toEqual(["fulfilled", "rejected", "fulfilled"]);
  expect(mocks.insert).toHaveBeenCalledTimes(4);
});
