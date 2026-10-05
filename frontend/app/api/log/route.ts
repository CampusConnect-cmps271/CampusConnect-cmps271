import { after, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buildEntry,
  clientLogSchema,
  MAX_LOG_BODY_BYTES,
  persistEntry,
} from "@/modules/logging";

/**
 * Receives browser log entries (SP1-39).
 *
 * Everything arriving here is attacker-controlled: the body is size-capped and
 * schema-validated, the context is redacted again server-side, and the user id
 * comes from the verified session rather than the payload. Always answers 204
 * so a logging endpoint can never become an oracle.
 */

/** Requests allowed per IP per window. */
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

/**
 * In-memory counter. Per server instance and lost on restart, which is fine
 * for keeping an accidental loop from filling the table. It is not a defence
 * against a distributed flood, and does not span instances.
 */
const hits = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });

    // Opportunistic cleanup so the map cannot grow without bound.
    if (hits.size > 5000) {
      for (const [k, v] of hits) {
        if (now > v.resetAt) hits.delete(k);
      }
    }

    return false;
  }

  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

/**
 * A fresh Response per call, never a shared module-level one: a Response is a
 * stateful object, and the runtime may set headers on it, so reusing a single
 * instance leaks state between requests.
 */
const noContent = () => new Response(null, { status: 204 });

export async function POST(request: NextRequest): Promise<Response> {
  if (isRateLimited(clientKey(request))) {
    return new Response(null, { status: 429 });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_LOG_BODY_BYTES) {
    return new Response(null, { status: 413 });
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return noContent();
  }

  // content-length can lie or be absent, so check the body we actually read.
  if (raw.length > MAX_LOG_BODY_BYTES) {
    return new Response(null, { status: 413 });
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

  const entry = buildEntry(
    parsed.data.level,
    parsed.data.event,
    parsed.data.context,
    { message: parsed.data.message, userId, source: "client" },
  );

  console.log(JSON.stringify({ ts: new Date().toISOString(), ...entry }));
  after(() => persistEntry(entry));

  return noContent();
}
