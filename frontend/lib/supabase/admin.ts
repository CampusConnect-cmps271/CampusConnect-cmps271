import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseConfig } from "./config";

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
export function createAdminClient() {
  const { url } = requireSupabaseConfig();
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();

  if (!secretKey) {
    throw new Error("Set SUPABASE_SECRET_KEY in .env.local.");
  }

  return createSupabaseClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
