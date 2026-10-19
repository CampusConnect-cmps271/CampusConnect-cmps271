import "server-only";

import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type CurrentSuspension = {
  reason: string;
  suspended_until: string | null;
};

export async function readCurrentSuspension(
  suppliedClient?: SupabaseServerClient,
): Promise<CurrentSuspension | null> {
  const supabase = suppliedClient ?? (await createClient());
  const { data, error } = await supabase.rpc("current_suspension");

  if (error) {
    throw new Error("Unable to verify account status.");
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row.reason !== "string") return null;

  return {
    reason: row.reason,
    suspended_until:
      typeof row.suspended_until === "string" ? row.suspended_until : null,
  };
}

export function suspensionMessage(suspension: CurrentSuspension) {
  const duration = suspension.suspended_until
    ? ` until ${new Date(suspension.suspended_until).toLocaleString("en", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      })} UTC`
    : " indefinitely";

  return `Your account is suspended${duration}. Reason: ${suspension.reason}`;
}

