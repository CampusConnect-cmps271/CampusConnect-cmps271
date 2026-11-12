import "server-only";
/** Numeric, request-local measurements only: no preference text or identifiers. */
export function recommendationTimings() {
  const start = performance.now();
  const values: Record<string, number> = {};
  return {
    async measure<T>(name: string, action: () => Promise<T>): Promise<T> {
      const began = performance.now();
      try { return await action(); } finally { values[name] = performance.now() - began; }
    },
    record(name: string, ms: number) { values[name] = ms; },
    header(cache?: string, reads?: number, bytes?: number) {
      values.total = performance.now() - start;
      return Object.entries(values).map(([name,ms])=>`${name};dur=${ms.toFixed(1)}`).join(", ") + (cache ? `, catalogue_cache;desc="${cache}"` : "") + (reads === undefined ? "" : `, catalogue_reads;desc="${reads}", catalogue_bytes;desc="${bytes}"`);
    },
  };
}
