import "server-only";
import { z } from "zod";
import { requireUser } from "@/modules/auth";
import { createClient } from "@/lib/supabase/server";
import { log } from "@/modules/logging";

const countsSchema = z.object({
  messages: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  notifications: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});

/** Private counters stay request-scoped; neither result nor identity is cached. */
export async function getHeaderCounts(): Promise<{ messages: number | null; notifications: number | null }> {
  await requireUser();
  try {
    const client = await createClient();
    const { data, error } = await client.rpc("get_my_header_counts");
    const result = countsSchema.safeParse(data);
    if (error || !result.success) throw new Error("unavailable");
    return result.data;
  } catch {
    log.error("navigation.counts.read_failure", { code: "unavailable" });
    return { messages: null, notifications: null };
  }
}
