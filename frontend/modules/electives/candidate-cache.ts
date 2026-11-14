import "server-only";
import { createHash } from "node:crypto";
import type { Candidate } from "./types";
import { CANDIDATE_TTL_MS, configuredCandidateRedis, type CandidateRedisStore, type CandidateEnvelope, type RedisReadStatus, type RedisWriteStatus } from "./upstash-candidate-cache";
export type CandidateCatalogue = { courses: Candidate[]; truncated: boolean; catalogueCount: number };
export type CandidateDiagnostics = { cache: "hit" | "miss" | "coalesced"; dbRequests: number; responseBytes: number; queryMs: number;
  cacheTier?: "memory" | "redis" | "database"; redisMs?: number; redisRead?: RedisReadStatus | "disabled" | "not_checked"; redisWrite?: RedisWriteStatus | "scheduled" | "not_checked" };
const MAX_ENTRIES = 64, MAX_BYTES = 8 * 1024 * 1024;
type Result = { value: CandidateCatalogue; diagnostics: CandidateDiagnostics };
/** Local memory -> optional shared Redis -> authenticated database. */
export function createCandidateCache(now = () => Date.now(), shared: () => CandidateRedisStore | undefined = () => undefined) {
  const entries = new Map<string, { until: number; bytes: number; value: CandidateCatalogue }>();
  const pending = new Map<string, Promise<Result>>();
  let bytes = 0;
  const remove = (key: string) => { const entry = entries.get(key); if (entry) bytes -= entry.bytes; entries.delete(key); };
  const remember = (key: string, value: CandidateCatalogue, until: number) => {
    const size = Buffer.byteLength(JSON.stringify(value));
    if (size > MAX_BYTES || until <= now()) return;
    remove(key);
    while (entries.size >= MAX_ENTRIES || bytes + size > MAX_BYTES) remove(entries.keys().next().value!);
    entries.set(key, { until, bytes: size, value: structuredClone(value) }); bytes += size;
  };
  const hitDiagnostics = (tier: "memory" | "redis", redisMs = 0): CandidateDiagnostics => ({ cache: "hit", cacheTier: tier, dbRequests: 0, responseBytes: 0, queryMs: 0,
    redisMs, redisRead: tier === "redis" ? "hit" : "not_checked", redisWrite: "not_checked" });
  return {
    clear() { entries.clear(); bytes = 0; },
    async load(key: string, loader: () => Promise<Result>, options: { deferWrite?: (work: () => Promise<void>) => void } = {}): Promise<Result> {
      for (const [id, entry] of entries) if (entry.until <= now()) remove(id);
      const cached = entries.get(key);
      if (cached) return { value: structuredClone(cached.value), diagnostics: hitDiagnostics("memory") };
      const existing = pending.get(key);
      if (existing) { const result = await existing; return { value: structuredClone(result.value), diagnostics: { ...hitDiagnostics(result.diagnostics.cacheTier === "redis" ? "redis" : "memory"), cache: "coalesced", cacheTier: result.diagnostics.cacheTier ?? "database", redisRead: "not_checked" } }; }
      const work = (async (): Promise<Result> => {
        const redis = shared(); let redisMs = 0, redisRead: CandidateDiagnostics["redisRead"] = "disabled";
        if (redis) {
          const began = performance.now(); const read = await redis.read(key); redisMs += performance.now() - began; redisRead = read.status;
          if (read.entry) { remember(key, read.entry.value, read.entry.expiresAt); return { value: read.entry.value, diagnostics: hitDiagnostics("redis", redisMs) }; }
        }
        const result = await loader();
        const entry: CandidateEnvelope = { version: 1, key, expiresAt: now() + CANDIDATE_TTL_MS, value: result.value };
        remember(key, result.value, entry.expiresAt);
        let redisWrite: CandidateDiagnostics["redisWrite"] = "not_checked";
        if (redis) {
          // Next's after() keeps the invocation alive without blocking the response.
          // Retain the original expiry even when the background write starts later.
          if (options.deferWrite) {
            try {
              options.deferWrite(async () => { await redis.write(key, entry); });
              redisWrite = "scheduled";
            } catch {
              // Non-request callers can still populate the cache synchronously.
              const began = performance.now(); redisWrite = await redis.write(key, entry); redisMs += performance.now() - began;
            }
          } else {
            const began = performance.now(); redisWrite = await redis.write(key, entry); redisMs += performance.now() - began;
          }
        }
        return { value: result.value, diagnostics: { ...result.diagnostics, cacheTier: "database", redisMs, redisRead, redisWrite } };
      })();
      pending.set(key, work);
      try { return await work; } finally { pending.delete(key); }
    },
  };
}
export const candidateCache = createCandidateCache(() => Date.now(), configuredCandidateRedis);
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical).sort((a,b)=>JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a < b ? -1 : a > b ? 1 : 0).map(([k,v])=>[k,canonical(v)]));
  return value;
}
export function candidateCacheKey(userId: string, query: unknown) {
  return createHash("sha256").update(JSON.stringify([process.env.NEXT_PUBLIC_SUPABASE_URL, userId, canonical(query)])).digest("hex");
}
