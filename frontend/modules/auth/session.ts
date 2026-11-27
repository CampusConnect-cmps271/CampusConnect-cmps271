import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PATHNAME_HEADER } from "@/lib/headers";
import { createClient } from "@/lib/supabase/server";
import { readCurrentLiveSessionContext } from "./live-context";
import { loginPathFor, verifyEmailPathFor } from "./navigation";

export type CurrentUser = {
  id: string;
  email: string | null;
  /**
   * Display name: the profile's full_name, else the registration name in Auth
   * metadata, else the email local part.
   */
  name: string;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * The student's name from their profile row (SP2-60), or null when it cannot
 * be read. Never throws: a missing row or a failed lookup falls back to the
 * Auth metadata name, and must never stand between a student and the app.
 *
 * Queries the table directly rather than through @/modules/profiles, which
 * itself depends on this module.
 */
async function readProfileName(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle<{ full_name: string | null }>();

    if (error || typeof data?.full_name !== "string") return null;

    const name = data.full_name.trim();
    return name.length > 0 ? name : null;
  } catch {
    return null;
  }
}

/**
 * Returns the verified current user, or null when signed out.
 *
 * Validates the signed token and reads live account/session state and the
 * display name in one RPC. Memoised with React cache within a request only.
 * The explicit rollback flag retains the previous Auth-service path.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  if (process.env.AUTH_LIVE_CONTEXT_ENABLED !== "false") {
    const context = await readCurrentLiveSessionContext();
    if (!context) return null;
    if (!context.confirmed) redirect(verifyEmailPathFor(context.email));
    const name = [context.profile_name, context.metadata_full_name, context.metadata_name]
      .map((value) => value?.trim()).find((value) => value);
    return { id: context.id, email: context.email, name: name ?? context.email?.split("@")[0] ?? "student" };
  }
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

  const profileName = await readProfileName(supabase, user.id);

  return {
    id: user.id,
    email,
    name: profileName ?? metadataName ?? email?.split("@")[0] ?? "student",
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

/** Live, caller-only display counts; never cached across incoming requests. */
export async function getCurrentUserHeaderCounts() {
  if (process.env.AUTH_LIVE_CONTEXT_ENABLED === "false") return null;
  const context = await readCurrentLiveSessionContext();
  return context?.confirmed ? context.header_counts : null;
}
