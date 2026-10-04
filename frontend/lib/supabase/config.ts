/**
 * Reads and validates the public Supabase connection details.
 *
 * Accepts both key formats Supabase issues: the current publishable keys
 * (`sb_publishable_...`) used by hosted projects, and the legacy anon JWTs that
 * `supabase start` still prints for local development.
 */

const PUBLISHABLE_KEY_PREFIX = "sb_publishable_";
const LOCAL_HOSTNAMES = ["localhost", "127.0.0.1", "[::1]"];

function isAcceptableKey(key: string) {
  if (key.startsWith(PUBLISHABLE_KEY_PREFIX)) return true;
  // Legacy anon key: a three-part JWT. Guard against a secret key being pasted
  // here by mistake, since anything in this file reaches the browser.
  return /^eyJ[\w-]*\.[\w-]+\.[\w-]+$/.test(key);
}

export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !publishableKey || !isAcceptableKey(publishableKey)) {
    return null;
  }

  try {
    const parsed = new URL(url);
    const isLocal = LOCAL_HOSTNAMES.includes(parsed.hostname);

    if (
      (parsed.protocol !== "https:" && !(isLocal && parsed.protocol === "http:")) ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      return null;
    }

    return { url: parsed.origin, publishableKey };
  } catch {
    return null;
  }
}

export function requireSupabaseConfig() {
  const config = getSupabaseConfig();

  if (!config) {
    throw new Error(
      "Set a valid Supabase project URL and publishable key in .env.local.",
    );
  }

  return config;
}
