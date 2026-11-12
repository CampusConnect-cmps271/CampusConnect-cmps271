import "server-only";
import { createHash } from "node:crypto";
import type { Candidate } from "./types";
export type CandidateCatalogue = { courses: Candidate[]; truncated: boolean; catalogueCount: number };
export type CandidateDiagnostics = { cache: "hit" | "miss" | "coalesced"; dbRequests: number; responseBytes: number; queryMs: number };
const TTL = 30_000, MAX_ENTRIES = 64, MAX_BYTES = 8 * 1024 * 1024;
/** Process-local, student/project scoped, bounded. Never stores auth, profiles or AI responses. */
export function createCandidateCache(now = () => Date.now()) {
  const entries = new Map<string, { until: number; bytes: number; value: CandidateCatalogue }>();
  const pending = new Map<string, Promise<{ value: CandidateCatalogue; diagnostics: CandidateDiagnostics }>>();
  let bytes = 0;
  const remove = (key: string) => { const entry = entries.get(key); if (entry) bytes -= entry.bytes; entries.delete(key); };
  return {
    clear() { entries.clear(); bytes = 0; },
    async load(key: string, loader: () => Promise<{ value: CandidateCatalogue; diagnostics: CandidateDiagnostics }>) {
      for (const [id, entry] of entries) if (entry.until <= now()) remove(id);
      const cached = entries.get(key);
      if (cached) return { value: structuredClone(cached.value), diagnostics: { cache: "hit" as const, dbRequests: 0, responseBytes: 0, queryMs: 0 } };
      const existing = pending.get(key);
      if (existing) { const result = await existing; return { value: structuredClone(result.value), diagnostics: { cache: "coalesced" as const, dbRequests: 0, responseBytes: 0, queryMs: 0 } }; }
      const work = loader(); pending.set(key, work);
      try {
        const result = await work;
        const size = Buffer.byteLength(JSON.stringify(result.value));
        if (size <= MAX_BYTES) {
          while (entries.size >= MAX_ENTRIES || bytes + size > MAX_BYTES) remove(entries.keys().next().value!);
          entries.set(key, { until: now() + TTL, bytes: size, value: structuredClone(result.value) }); bytes += size;
        }
        return result;
      } finally { pending.delete(key); }
    },
  };
}
export const candidateCache = createCandidateCache();
export function candidateCacheKey(userId: string, query: unknown) {
  return createHash("sha256").update(JSON.stringify([process.env.NEXT_PUBLIC_SUPABASE_URL, userId, query])).digest("hex");
}
