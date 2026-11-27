import "server-only";
import { z } from "zod";
import { cache } from "react";
import { headerCountsSchema } from "@/lib/header-counts";
import { createClient } from "@/lib/supabase/server";
import { traceCoursePhase } from "@/modules/performance/course-tracing";
import { log } from "@/modules/logging";

const claimsSchema = z.object({
  sub: z.uuid(), session_id: z.uuid(), role: z.literal("authenticated"),
  aud: z.union([z.string(), z.array(z.string())]).refine((aud) =>
    typeof aud === "string" ? aud === "authenticated" : aud.includes("authenticated")),
  iss: z.string(), exp: z.number().int().positive(),
});
const contextSchema = z.object({
  header_counts: z.unknown().optional(),
  id: z.uuid(), email: z.string().nullable(), confirmed: z.boolean(),
  profile_name: z.string().nullable(), metadata_full_name: z.string().nullable(), metadata_name: z.string().nullable(),
});
let nextFailureLog = 0;

/** No shared cache: signature validation and live state are checked per request. */
export async function readLiveSessionContext(client: Awaited<ReturnType<typeof createClient>>) {
  try {
    // Never authorize from getSession().user or editable user_metadata.
    // getClaims verifies signature/expiration, using cached public signing keys
    // for asymmetric projects. The SDK retains its Auth validation fallback for
    // symmetric keys; the application never disables signature validation.
    const { data, error } = await traceCoursePhase("jwt_verification", () => client.auth.getClaims());
    const checked = claimsSchema.safeParse(data?.claims);
    if (error || !checked.success) return null;
    const project = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    if (!project || checked.data.iss !== `${new URL(project).origin}/auth/v1` || checked.data.exp <= Date.now() / 1000) return null;

    const result = await traceCoursePhase("live_session", async () => await client.rpc("get_my_session_context"));
    // A revoked, deleted, banned or expired identity returns null. Do not
    // retry it through getUser(), which would bypass this live decision.
    if (!result.error && result.data === null) return null;
    const parsed = contextSchema.safeParse(result.data);
    if (result.error || !parsed.success || parsed.data.id !== checked.data.sub) {
      if (Date.now() >= nextFailureLog) {
        nextFailureLog = Date.now() + 60_000;
        log.warn("auth.context.read_failure", { code: result.error?.code ?? "invalid_data" });
      }
      return null;
    }
    // Optional display data must not invalidate a verified identity. Older
    // migrations omit it; bad/unavailable counts use the existing caller RPC.
    const counts = headerCountsSchema.safeParse(parsed.data.header_counts);
    return { ...parsed.data, header_counts: counts.success ? counts.data : null };
  } catch {
    // A failed identity check must not grant access. Cookies remain available
    // for the normal proxy refresh flow; this never signs another user in.
    return null;
  }
}

/** Shares verified live state only within the current React render/request. */
export const readCurrentLiveSessionContext = cache(async () =>
  readLiveSessionContext(await createClient()),
);
