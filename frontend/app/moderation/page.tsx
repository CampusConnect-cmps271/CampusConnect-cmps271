import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { AdminPageShell } from "@/components/AdminPageShell";
import ModerationQueue, {
  type ModerationQueueItem,
} from "@/modules/moderation/moderation-queue";

export const metadata: Metadata = { title: "Moderation queue · CampusConnect" };

export default async function ModerationPage() {
  await requireRole(["moderator", "administrator"]);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("moderation_queue");

  if (error) throw new Error("Unable to load the moderation queue.");

  return (
    <AdminPageShell title="Moderation queue" description="Review grouped reports oldest first. Removing content and dismissing reports both require an audit reason." maxWidth="max-w-4xl" eyebrow="CampusConnect safety">
      <ModerationQueue items={(data ?? []) as ModerationQueueItem[]} />
    </AdminPageShell>
  );
}

