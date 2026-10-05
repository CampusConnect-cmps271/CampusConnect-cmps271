import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PATHNAME_HEADER } from "@/lib/headers";
import { createClient } from "@/lib/supabase/server";
import { loginPathFor, verifyEmailPathFor } from "./navigation";

export type CurrentUser = {
  id: string;
  email: string | null;
  /** Display name: the profile name when set, otherwise the email local part. */
  name: string;
};

/**
 * Returns the verified current user, or null when signed out.
 *
 * Uses `getUser()` to read the current confirmation state from Auth rather
 * than trusting editable metadata or stale cookie/JWT user data. Memoised
 * with React `cache` so a layout and its page share one lookup per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) return null;

  if (!user.email_confirmed_at) redirect(verifyEmailPathFor(user.email));

  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const email = user.email ?? null;

  const metadataName = ["full_name", "name"]
    .map((key) => (typeof metadata[key] === "string" ? String(metadata[key]) : ""))
    .map((value) => value.trim())
    .find((value) => value.length > 0);

  return {
    id: user.id,
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
