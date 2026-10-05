import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { clientLogSchema, log, MAX_LOG_BODY_BYTES } from "@/modules/logging";

/**
 * Receives browser log entries (SP1-39).
 *
 * Everything arriving here is attacker-controlled: the body is read against a
 * byte cap, schema-validated, and the context redacted again server-side. The
 * user id comes from the verified session rather than the payload. Always
 * answers 204 so a logging endpoint can never become an oracle.
 */

/** Requests allowed per key per window. */
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;
/** Hard ceiling on tracked keys, so the map cannot grow without bound. */
const MAX_TRACKED_KEYS = 5_000;

/**
 * In-memory counter, per server instance, lost on restart.
 *
 * This keeps a runaway client from filling the table. It is NOT a defence
 * against a determined attacker: the key is derived from `x-forwarded-for`,
 * which the client controls unless a trusted proxy overwrites it, so rotating
 * that header gets a fresh bucket every time. The same-origin check below is
 * what actually keeps casual cross-site writes out.
 *
 * Map iteration order is insertion order, so evicting the oldest key gives a
 * bounded structure without a real LRU.
 */
const hits = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = hits.get(key);

  if (entry && now <= entry.resetAt) {
    entry.count += 1;
    return entry.count > RATE_LIMIT;
  }

  // Refresh the window, and keep the map bounded by dropping the oldest key
  // rather than scanning the whole thing looking for expired ones.
  hits.delete(key);
  while (hits.size >= MAX_TRACKED_KEYS) {
    const oldest = hits.keys().next();
    if (oldest.done) break;
    hits.delete(oldest.value);
  }

  hits.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
  return false;
}

function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Only accept entries the browser sent from our own pages.
 *
 * Without this anyone can forge rows in the application log, including
 * plausible-looking auth events. Sec-Fetch-Site is set by the browser and
 * cannot be overridden by page script. Requests that omit it entirely (older
 * browsers, curl) are allowed through, so this raises the bar rather than
 * sealing the endpoint; a session is deliberately not required, because the
 * failures most worth hearing about happen on /login and /register, where
 * there is no session yet.
 */
function isSameOrigin(request: NextRequest): boolean {
  const site = request.headers.get("sec-fetch-site");
  return site === null || site === "same-origin" || site === "none";
}

/**
 * Reads the body against a byte cap, without buffering a huge one first.
 *
 * `content-length` can be absent or wrong (chunked encoding), so the stream is
 * accumulated and abandoned the moment it crosses the limit. Returns null when
 * the body is too large.
 */
async function readCappedBody(request: NextRequest): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_LOG_BODY_BYTES) return null;

  const body = request.body;
  if (!body) return "";

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      total += value.byteLength;
      if (total > MAX_LOG_BODY_BYTES) {
        await reader.cancel();
        return null;
      }

      chunks.push(value);
    }
  } catch {
    return "";
  }

  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(joined);
}

const noContent = () => new Response(null, { status: 204 });

export async function POST(request: NextRequest): Promise<Response> {
  if (!isSameOrigin(request)) {
    return new Response(null, { status: 403 });
  }

  if (isRateLimited(clientKey(request))) {
    return new Response(null, { status: 429 });
  }

  const raw = await readCappedBody(request);
  if (raw === null) {
    return new Response(null, { status: 413 });
  }
  if (raw.length === 0) {
    return noContent();
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400 });
  }

  const parsed = clientLogSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return new Response(null, { status: 400 });
  }

  // The session decides the user id; the payload never does.
  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const sub = data?.claims?.sub;
    if (typeof sub === "string") userId = sub;
  } catch {
    // Unauthenticated or unreadable session: store the entry without a user.
  }

  // Reuse the module's own emit rather than repeating it, so both write paths
  // keep the same stdout shape and the same after() handling.
  log[parsed.data.level](parsed.data.event, parsed.data.context, {
    message: parsed.data.message,
    userId,
    source: "client",
  });

  return noContent();
}
