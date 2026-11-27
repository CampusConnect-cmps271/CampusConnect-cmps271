import { expect, it, vi } from "vitest";
import { createBatchWriter } from "./batch-writer";

it("preserves every row in a burst while reducing database calls", async () => {
  const rows: number[] = [];
  const write = vi.fn(async (batch: readonly number[]) => { rows.push(...batch); });
  const writer = createBatchWriter({ write, maxBatch: 25, maxQueued: 100 });
  await Promise.all(Array.from({ length: 100 }, (_, index) => writer.enqueue(index)));
  expect(rows).toEqual(Array.from({ length: 100 }, (_, index) => index));
  expect(write).toHaveBeenCalledTimes(4);
});

it("applies backpressure and allows only one insert at a time", async () => {
  let release!: () => void;
  const first = new Promise<void>(resolve => { release = resolve; });
  let active = 0, peak = 0;
  const rows: number[] = [];
  const write = vi.fn(async (batch: readonly number[]) => {
    active++; peak = Math.max(peak, active);
    if (write.mock.calls.length === 1) await first;
    rows.push(...batch); active--;
  });
  const writer = createBatchWriter({ write, maxBatch: 2, maxQueued: 2 });
  const done = Promise.all(Array.from({ length: 10 }, (_, i) => writer.enqueue(i)));
  await Promise.resolve(); await Promise.resolve();
  expect(write).toHaveBeenCalledTimes(1);
  release(); await done;
  expect(peak).toBe(1); expect(rows).toEqual(Array.from({ length: 10 }, (_, i) => i));
  expect(write.mock.calls.every(([batch]) => batch.length <= 2)).toBe(true);
});

it("never retries ambiguous failures and continues draining later rows", async () => {
  const offline = new Error("connection lost after sending");
  const write = vi.fn<(rows: readonly number[]) => Promise<void>>()
    .mockRejectedValueOnce(offline).mockResolvedValue(undefined);
  const writer = createBatchWriter({ write, maxBatch: 2, maxQueued: 4 });
  const results = await Promise.allSettled([1, 2, 3, 4].map(row => writer.enqueue(row)));
  expect(results.map(result => result.status)).toEqual(["rejected", "rejected", "fulfilled", "fulfilled"]);
  await writer.enqueue(5);
  expect(write.mock.calls.map(([batch]) => batch)).toEqual([[1, 2], [3, 4], [5]]);
});

it("isolates a rejected atomic data row so valid neighbors survive", async () => {
  const rows: number[] = [];
  const write = vi.fn(async (batch: readonly number[]) => {
    if (batch.includes(2)) throw { code: "22P02" };
    rows.push(...batch);
  });
  const writer = createBatchWriter({ write, maxBatch: 3, maxQueued: 3, isolateDataError: () => true });
  const results = await Promise.allSettled([1, 2, 3].map(row => writer.enqueue(row)));
  expect(results.map(result => result.status)).toEqual(["fulfilled", "rejected", "fulfilled"]);
  expect(rows).toEqual([1, 3]); expect(write).toHaveBeenCalledTimes(4);
});

it("bounds batch payload size and isolates an oversized row", async () => {
  const write = vi.fn<(rows: readonly string[]) => Promise<void>>().mockResolvedValue(undefined);
  const writer = createBatchWriter({ write, maxBatch: 10, maxQueued: 10, maxBatchBytes: 9, size: row => JSON.stringify(row).length });
  await Promise.all(["a", "b", "oversized", "c"].map(row => writer.enqueue(row)));
  expect(write.mock.calls.map(([batch]) => batch)).toEqual([["a", "b"], ["oversized"], ["c"]]);
});
