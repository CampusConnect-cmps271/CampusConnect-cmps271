/**
 * Reads and validates the public Supabase connection details.
 *
 * Accepts both key formats Supabase issues: the current publishable keys
 * (`sb_publishable_...`) used by hosted projects, and the legacy anon JWTs that
 * `supabase start` still prints for local development.
 */

const PUBLISHABLE_KEY_PREFIX = "sb_publishable_";
const LOCAL_HOSTNAMES = ["localhost", "127.0.0.1", "[::1]"];

/**
 * Legacy anon keys and service_role keys are both three-part JWTs that start
 * the same way, so shape alone cannot tell them apart. Decode the payload and
 * insist on the anon role: a service_role key here would be inlined into the
 * browser bundle, handing every visitor a key that bypasses row-level
 * security.
 */
function isAnonJwt(key: string) {
  const parts = key.split(".");
  if (parts.length !== 3 || !parts[0].startsWith("eyJ")) return false;

  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const decoded: unknown = JSON.parse(atob(payload));
    return (
      typeof decoded === "object" &&
      decoded !== null &&
      (decoded as { role?: unknown }).role === "anon"
    );
  } catch {
    return false;
  }
}

function isAcceptableKey(key: string) {
  if (key.startsWith(PUBLISHABLE_KEY_PREFIX)) return true;
  // A secret key (sb_secret_...) never matches either branch.
  return isAnonJwt(key);
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
