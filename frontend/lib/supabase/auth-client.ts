import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./config";

export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super("Set a valid Supabase project URL and publishable key in .env.");
  }
}

/**
 * A fresh, stateless Supabase client for a single server request.
 * Unlike the cookie-based client in ./server.ts, sessions stay in memory only,
 * so verifying a password-recovery code never signs the browser in.
 */
export function createSupabaseAuthClient(): SupabaseClient {
  const config = getSupabaseConfig();
  if (!config) throw new SupabaseNotConfiguredError();

  return createClient(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
