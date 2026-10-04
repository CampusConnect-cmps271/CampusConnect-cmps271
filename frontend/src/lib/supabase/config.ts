export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !publishableKey?.startsWith("sb_publishable_")) {
    return null;
  }

  try {
    const parsed = new URL(url);
    const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);

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
    throw new Error("Set a valid Supabase project URL and publishable key in frontend/.env.");
  }

  return config;
}
