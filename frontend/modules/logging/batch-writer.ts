/** A single writer with backpressure. No timer, sampling or automatic retries. */
export function createBatchWriter<T>(options: {
  write: (rows: readonly T[]) => Promise<void>;
  maxBatch: number;
  maxQueued: number;
  maxBatchBytes?: number;
  size?: (row: T) => number;
  isolateDataError?: (error: unknown) => boolean;
}) {
  if (!Number.isInteger(options.maxBatch) || options.maxBatch < 1 ||
      !Number.isInteger(options.maxQueued) || options.maxQueued < 1) {
    throw new RangeError("Batch and queue limits must be positive integers");
  }
  type Pending = { row: T; bytes: number; resolve: () => void; reject: (error: unknown) => void };
  const queued: Pending[] = [];
  let running = false;
  let capacity: Promise<void> | undefined;
  let releaseCapacity: (() => void) | undefined;

  async function drain() {
    try {
      while (queued.length) {
        let count = 0, bytes = 2; // JSON array brackets and commas.
        while (count < Math.min(queued.length, options.maxBatch)) {
          const added = queued[count].bytes + (count ? 1 : 0);
          if (count && bytes + added > (options.maxBatchBytes ?? Infinity)) break;
          bytes += added; count++;
        }
        // An oversized single row is tried alone, preserving prior behavior.
        const batch = queued.splice(0, count);
        const release = releaseCapacity;
        capacity = undefined;
        releaseCapacity = undefined;
        release?.();
        try {
          await options.write(batch.map(item => item.row));
          batch.forEach(item => item.resolve());
        } catch (error) {
          // Only explicit atomic input/constraint failures may be isolated.
          // A timeout could follow a committed insert: never retry it.
          if (batch.length > 1 && options.isolateDataError?.(error)) {
            for (const item of batch) {
              try { await options.write([item.row]); item.resolve(); }
              catch (cause) { item.reject(cause); }
            }
          } else {
            batch.forEach(item => item.reject(error));
          }
        }
      }
    } finally {
      running = false;
    }
  }

  return {
    async enqueue(row: T): Promise<void> {
      const bytes = options.size?.(row) ?? 0;
      while (queued.length >= options.maxQueued) {
        capacity ??= new Promise<void>(resolve => { releaseCapacity = resolve; });
        await capacity;
      }
      return new Promise<void>((resolve, reject) => {
        queued.push({ row, bytes, resolve, reject });
        if (!running) {
          running = true;
          // Entries queued in this turn share the first insert; entries arriving
          // during an insert share later batches. No intentional flush delay.
          void Promise.resolve().then(drain);
        }
      });
    },
  };
}
