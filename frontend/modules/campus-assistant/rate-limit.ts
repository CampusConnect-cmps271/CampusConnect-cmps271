const MAX_TRACKED_KEYS = 5_000;

/**
 * In-memory fixed-window counter, per server instance and lost on restart. It
 * stops one student from running up the provider bill; it is not a shared
 * quota across instances. Insertion order lets the oldest key be evicted, which
 * keeps the map bounded without scanning it.
 */
export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  /** Counts one request. Returns the seconds to wait when over the limit, else 0. */
  return function check(key: string): number {
    const time = now();
    const entry = hits.get(key);

    if (entry && time <= entry.resetAt) {
      entry.count += 1;
      return entry.count > limit ? Math.ceil((entry.resetAt - time) / 1000) : 0;
    }

    hits.delete(key);
    while (hits.size >= MAX_TRACKED_KEYS) {
      const oldest = hits.keys().next();
      if (oldest.done) break;
      hits.delete(oldest.value);
    }
    hits.set(key, { count: 1, resetAt: time + windowMs });
    return 0;
  };
}
