import "server-only";
import { headerCountsSchema } from "@/lib/header-counts";
import { getCurrentUserHeaderCounts, requireUser } from "@/modules/auth";
import { createClient } from "@/lib/supabase/server";
import { log } from "@/modules/logging";

/** Private counters stay request-scoped; neither result nor identity is cached. */
export async function getHeaderCounts(): Promise<{ messages: number | null; notifications: number | null }> {
  await requireUser();
  try {
    const bundled = await getCurrentUserHeaderCounts();
    if (bundled) return bundled;
    // Compatibility with the prior migration and the explicit Auth rollback.
    const client = await createClient();
    const { data, error } = await client.rpc("get_my_header_counts");
    const result = headerCountsSchema.safeParse(data);
    if (error || !result.success) throw new Error("unavailable");
    return result.data;
  } catch {
    log.error("navigation.counts.read_failure", { code: "unavailable" });
    return { messages: null, notifications: null };
  }
}
