import "server-only";
import { createClient } from "@/lib/supabase/server";
import { summarizePerformance, type MetricRow } from "./summary";

export async function loadPerformance(hours: number) {
  const supabase = await createClient();
  // Caller session plus administrator-only app_logs SELECT RLS, never service role.
  const { data, error } = await supabase.from("app_logs")
    .select("event,context")
    .eq("source", "server")
    .in("event", ["api.request.completed", "database.request.slow_or_failed"])
    .gte("created_at", new Date(Date.now() - hours * 3_600_000).toISOString())
    .order("created_at", { ascending: false }).limit(1000);
  if (error) throw new Error("Performance metrics are unavailable.");
  const rows = (data ?? []) as MetricRow[];
  return { ...summarizePerformance(rows), rows: rows.length, capped: rows.length === 1000 };
}
