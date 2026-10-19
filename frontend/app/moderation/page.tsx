import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
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
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <Link href="/home" className="text-sm font-semibold text-blue-700 hover:underline dark:text-blue-300">
        ← Back to feed
      </Link>
      <header className="my-6">
        <h1 className="text-3xl font-bold">Moderation queue</h1>
        <p className="mt-2 text-sm opacity-75">Open reports are grouped by content, oldest first.</p>
      </header>
      <ModerationQueue items={(data ?? []) as ModerationQueueItem[]} />
    </main>
  );
}

