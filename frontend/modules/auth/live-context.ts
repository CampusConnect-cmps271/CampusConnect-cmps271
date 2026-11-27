import "server-only";
import { z } from "zod";
import type { createClient } from "@/lib/supabase/server";
import { log } from "@/modules/logging";

const claimsSchema = z.object({
  sub: z.uuid(), session_id: z.uuid(), role: z.literal("authenticated"),
  aud: z.union([z.string(), z.array(z.string())]).refine((aud) =>
    typeof aud === "string" ? aud === "authenticated" : aud.includes("authenticated")),
  iss: z.string(), exp: z.number().int().positive(),
});
const contextSchema = z.object({
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
    const { data, error } = await client.auth.getClaims();
    const checked = claimsSchema.safeParse(data?.claims);
    if (error || !checked.success) return null;
    const project = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    if (!project || checked.data.iss !== `${new URL(project).origin}/auth/v1` || checked.data.exp <= Date.now() / 1000) return null;

    const result = await client.rpc("get_my_session_context");
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
    return parsed.data;
  } catch {
    // A failed identity check must not grant access. Cookies remain available
    // for the normal proxy refresh flow; this never signs another user in.
    return null;
  }
}
