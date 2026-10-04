import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PATHNAME_HEADER } from "@/lib/headers";
import { createClient } from "@/lib/supabase/server";
import { loginPathFor } from "./navigation";

export type CurrentUser = {
  id: string;
  email: string | null;
  /** Display name: the profile name when set, otherwise the email local part. */
  name: string;
};

/**
 * Returns the verified current user, or null when signed out.
 *
 * Uses `getClaims()`, which verifies the JWT signature, rather than
 * `getSession()`, which trusts whatever is in the cookie. Memoised with React
 * `cache` so a layout and the page it wraps share one verification per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) return null;

  const { claims } = data;
  const metadata = (claims.user_metadata ?? {}) as Record<string, unknown>;
  const email = typeof claims.email === "string" ? claims.email : null;

  const metadataName = ["full_name", "name"]
    .map((key) => (typeof metadata[key] === "string" ? String(metadata[key]) : ""))
    .map((value) => value.trim())
    .find((value) => value.length > 0);

  return {
    id: String(claims.sub),
    email,
    name: metadataName ?? email?.split("@")[0] ?? "student",
  };
});

/**
 * Returns the current user or redirects a signed-out visitor to the login page,
 * remembering the path they asked for. The pathname comes from the header the
 * root proxy sets, since Server Components cannot read the URL directly.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();

  if (user) return user;

  const requestHeaders = await headers();
  redirect(loginPathFor(requestHeaders.get(PATHNAME_HEADER)));
}
