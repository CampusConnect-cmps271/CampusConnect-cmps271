import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createBatchWriter } from "./batch-writer";
import type { LogEntry } from "./log";

export type LogRow = LogEntry & { created_at: string };
const DATA_ERRORS = new Set(["22P02", "22001", "23502", "23514"]);
const stateKey = Symbol.for("campus-connect.log-writers.v1");
type Writer = ReturnType<typeof createBatchWriter<LogRow>>;
type Writers = { routine: Writer; diagnostic: Writer };
const globals = globalThis as unknown as Record<symbol, Writers | undefined>;

async function insert(rows: readonly LogRow[], timeoutMs: number) {
  const { error } = await createAdminClient().from("app_logs").insert([...rows])
    .abortSignal(AbortSignal.timeout(timeoutMs));
  if (error) throw error;
}

function createWriter(timeoutMs: number, maxBatch: number, maxQueued: number) {
  return createBatchWriter<LogRow>({
    maxBatch, maxQueued, maxBatchBytes: 128 * 1024,
    size: row => new TextEncoder().encode(JSON.stringify(row)).length,
    write: rows => insert(rows, timeoutMs),
    isolateDataError: error => typeof error === "object" && error !== null &&
      "code" in error && typeof error.code === "string" && DATA_ERRORS.has(error.code),
  });
}

/** Shared across instrumentation and page bundles within this Node process. */
function writers() {
  return globals[stateKey] ??= {
    routine: createWriter(10000, 25, 100),
    // Keep optional diagnostics' shorter timeout and queue independent of
    // routine/security logs. A diagnostic abort cannot cancel those rows.
    diagnostic: createWriter(1000, 10, 16),
  };
}

/** Row must already be redacted (or constructed from the trace whitelist). */
export function storeLogRow(row: LogRow, kind: "routine" | "diagnostic" = "routine") {
  if (process.env.LOG_BATCHING_ENABLED === "false") {
    return insert([row], kind === "diagnostic" ? 1000 : 10000);
  }
  return writers()[kind].enqueue(row);
}
