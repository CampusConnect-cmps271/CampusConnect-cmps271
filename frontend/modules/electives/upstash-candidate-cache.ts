import "server-only";
import { Redis } from "@upstash/redis";
import { createHash } from "node:crypto";
import { candidateEnvelopeSchema } from "./candidate-cache-schema";
import type { CandidateCatalogue } from "./candidate-cache";
export const CANDIDATE_TTL_MS = 30_000;
export const MAX_REDIS_CANDIDATE_BYTES = 256 * 1024;
export type CandidateEnvelope = { version: 1; key: string; expiresAt: number; value: CandidateCatalogue };
export type RedisReadStatus = "hit" | "miss" | "error" | "circuit_open" | "invalid";
export type RedisWriteStatus = "stored" | "error" | "circuit_open" | "oversize" | "expired";
export type CandidateRedisClient = {
  get(key: string): Promise<unknown>;
  set(key: string, value: string, options: { px: number }): Promise<unknown>;
};
export function createRedisCandidateStore(client: CandidateRedisClient, namespace: string, now = () => Date.now()) {
  let unavailableUntil = 0;
  const redisKey = (key: string) => `campusconnect:electives:v3:${namespace}:${key}`;
  return {
    async read(key: string): Promise<{ status: RedisReadStatus; entry?: CandidateEnvelope }> {
      if (unavailableUntil > now()) return { status: "circuit_open" };
      try {
        const raw = await client.get(redisKey(key));
        if (raw === null) return { status: "miss" };
        if (typeof raw !== "string" || Buffer.byteLength(raw) > MAX_REDIS_CANDIDATE_BYTES) return { status: "invalid" };
        let decoded: unknown;
        try { decoded = JSON.parse(raw); } catch { return { status: "invalid" }; }
        const parsed = candidateEnvelopeSchema.safeParse(decoded);
        if (!parsed.success || parsed.data.key !== key || parsed.data.expiresAt <= now() || parsed.data.expiresAt > now() + CANDIDATE_TTL_MS + 1000) return { status: "invalid" };
        return { status: "hit", entry: parsed.data };
      } catch { unavailableUntil = now() + 30_000; return { status: "error" }; }
    },
    async write(key: string, entry: CandidateEnvelope): Promise<RedisWriteStatus> {
      if (unavailableUntil > now()) return "circuit_open";
      const remaining = entry.expiresAt - now();
      if (remaining <= 0) return "expired";
      const payload = JSON.stringify(entry);
      if (Buffer.byteLength(payload) > MAX_REDIS_CANDIDATE_BYTES) return "oversize";
      try { await client.set(redisKey(key), payload, { px: Math.min(remaining, CANDIDATE_TTL_MS) }); return "stored"; }
      catch { unavailableUntil = now() + 30_000; return "error"; }
    },
  };
}
export type CandidateRedisStore = ReturnType<typeof createRedisCandidateStore>;
export function candidateRedisNamespace(env: Partial<NodeJS.ProcessEnv> = process.env) {
  const environment = env.VERCEL_ENV || "local";
  return createHash("sha256").update(JSON.stringify([environment, env.VERCEL_PROJECT_ID || "campusconnect", env.UPSTASH_REDIS_CACHE_NAMESPACE || "default"])).digest("hex").slice(0,24);
}
let current: { identity: string; store: CandidateRedisStore } | undefined;
/** Credentials are server-only. Tests use explicit stores; never contact real Redis implicitly. */
export function configuredCandidateRedis(): CandidateRedisStore | undefined {
  if (process.env.NODE_ENV === "test") return undefined;
  const endpoint = process.env.UPSTASH_REDIS_REST_URL?.trim(), token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!endpoint || !token) return undefined;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".upstash.io") || url.username || url.password || url.search || url.hash || url.pathname !== "/" || (url.port && url.port !== "443")) return undefined;
    const configuredTimeout = Number(process.env.UPSTASH_REDIS_TIMEOUT_MS?.trim());
    const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout >= 50 && configuredTimeout <= 2000 ? Math.floor(configuredTimeout) : process.env.VERCEL_ENV ? 200 : 1500;
    const namespace = candidateRedisNamespace();
    const identity = createHash("sha256").update(JSON.stringify([endpoint,token,namespace,timeoutMs])).digest("hex");
    if (current?.identity === identity) return current.store;
    const client = new Redis({ url: url.origin, token, automaticDeserialization: false, retry: { retries: 0 },
      signal: () => AbortSignal.timeout(timeoutMs), enableAutoPipelining: false, enableTelemetry: false });
    current = { identity, store: createRedisCandidateStore(client, namespace) };
    return current.store;
  } catch { return undefined; }
}
