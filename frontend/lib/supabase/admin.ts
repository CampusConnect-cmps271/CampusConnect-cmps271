import "server-only";
import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

/**
 * Supabase client holding the project's secret key.
 *
 * This key bypasses row-level security, so it must never reach the browser.
 * The `server-only` import above turns an accidental client import into a
 * build error rather than a leak.
 *
 * Used by modules/logging to write app_logs, which has RLS on and no
 * policies: the secret key is the only way in.
 */

const LOCAL_HOSTNAMES = ["localhost", "127.0.0.1", "[::1]"];

/**
 * Validates the project URL on its own.
 *
 * Deliberately not `requireSupabaseConfig()`: that also demands a valid
 * *publishable* key, which this client never uses. Borrowing it meant a
 * missing or malformed publishable key stopped logging entirely — and the log
 * row that would have told you about the misconfiguration was the one that
 * could not be written.
 */
function adminUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL in .env.local.");

  const parsed = new URL(raw);
  const isLocal = LOCAL_HOSTNAMES.includes(parsed.hostname);

  if (parsed.protocol !== "https:" && !(isLocal && parsed.protocol === "http:")) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must use https outside local development.");
  }

  return parsed.origin;
}

/**
 * Built once and shared. The client carries no per-request state — sessions
 * and token refresh are both off — so unlike the cookie-bound client in
 * server.ts it is safe to reuse, and rebuilding it per log row meant
 * constructing a whole Supabase client on a hot path.
 */
let cached: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  if (cached) return cached;

  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new Error("Set SUPABASE_SECRET_KEY in .env.local.");
  }

  cached = createSupabaseClient(adminUrl(), secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return cached;
}
