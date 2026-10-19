"use server";

import * as z from "zod";
import { requireUser } from "@/modules/auth";
import { log } from "@/modules/logging";
import { createClient } from "@/lib/supabase/server";

const notificationIdSchema = z.uuid();

/** Marks one of the signed-in student's notifications read. */
export async function markNotificationRead(id: string): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const parsed = notificationIdSchema.safeParse(id);
  if (!parsed.success) return { ok: false };

  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", parsed.data)
    .eq("recipient_id", user.id)
    .is("read_at", null);

  if (error) {
    log.error(
      "notifications.read.failure",
      { notificationId: parsed.data, code: error.code ?? null },
      { userId: user.id },
    );
    return { ok: false };
  }

  return { ok: true };
}

/** Marks all of the signed-in student's notifications read. */
export async function markAllNotificationsRead(): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", user.id)
    .is("read_at", null);

  if (error) {
    log.error(
      "notifications.read_all.failure",
      { code: error.code ?? null },
      { userId: user.id },
    );
    return { ok: false };
  }

  return { ok: true };
}
