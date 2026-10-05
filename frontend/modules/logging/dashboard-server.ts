import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ErrorLogRow } from "./dashboard";

export async function loadRecentErrors(hours: number): Promise<ErrorLogRow[]> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("app_logs")
    .select("id,created_at,source,event,message,user_id,context")
    .eq("level", "error")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(`Could not load error dashboard: ${error.message}`);
  return (data ?? []) as ErrorLogRow[];
}
