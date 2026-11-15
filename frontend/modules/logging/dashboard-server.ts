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

export type ApiAvailabilityRow = {
  endpoint: string;
  method: string;
  total_requests: number;
  successful_requests: number;
  client_errors: number;
  server_errors: number;
  availability_percent: number | null;
};

export async function loadApiAvailability(
  hours = 24,
): Promise<ApiAvailabilityRow[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc(
    "get_api_availability",
    { hours_back: hours },
  );

  if (error) {
    throw new Error(
      `Could not load API availability: ${error.message}`,
    );
  }

  return (data ?? []) as ApiAvailabilityRow[];
}
