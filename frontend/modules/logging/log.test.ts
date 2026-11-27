import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ after: vi.fn(), store: vi.fn(), alert: vi.fn() }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("./log-store", () => ({ storeLogRow: mocks.store }));
vi.mock("@/modules/monitoring", () => ({ notifyLogAlert: mocks.alert }));
import { buildEntry, log, persistEntry } from "./log";
afterEach(() => { vi.restoreAllMocks(); vi.resetAllMocks(); });
it("defers redacted rows while retaining the original emission timestamp", async () => {
  const output = vi.spyOn(console, "log").mockImplementation(() => {});
  const callbacks: (() => Promise<void>)[] = [];
  mocks.after.mockImplementation(callback => { callbacks.push(callback); }); mocks.store.mockResolvedValue(undefined);
  await log.info("auth.login.success", { password: "test-only", email: "student@example.org" });
  expect(mocks.store).not.toHaveBeenCalled(); await callbacks[0]();
  const printed = JSON.parse(output.mock.calls[0][0]); const stored = mocks.store.mock.calls[0][0];
  expect(stored.created_at).toBe(printed.ts); expect(stored.context.password).toBe("[redacted]");
  expect(JSON.stringify(stored)).not.toContain("student@example.org"); expect(mocks.alert).toHaveBeenCalledTimes(1);
});
it("preserves per-entry alert delivery after persistence completes", async () => {
  let release!: () => void;
  mocks.store.mockReturnValue(new Promise<void>(resolve => { release = resolve; }));
  const entry = buildEntry("error", "auth.login.failure"); const done = persistEntry(entry);
  expect(mocks.alert).not.toHaveBeenCalled(); release(); await done;
  expect(mocks.alert).toHaveBeenCalledExactlyOnceWith(entry);
});
it("handles write failures without recursive logging or false alerts", async () => {
  const output = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.store.mockRejectedValue({ message: "offline" });
  await expect(persistEntry(buildEntry("warn", "database.fetch.slow"))).resolves.toBeUndefined();
  expect(mocks.alert).not.toHaveBeenCalled(); expect(output).toHaveBeenCalledTimes(1);
  expect(JSON.parse(output.mock.calls[0][0]).event).toBe("logging.write.failure");
});
it("still awaits persistence outside a request scope", async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  mocks.after.mockImplementation(() => { throw Error("no request"); }); mocks.store.mockResolvedValue(undefined);
  await log.warn("app.start.missing_env"); expect(mocks.store).toHaveBeenCalledTimes(1);
});
