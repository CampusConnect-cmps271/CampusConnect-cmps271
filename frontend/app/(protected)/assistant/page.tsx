import { AppShell } from "@/components/AppShell";
import type { Metadata } from "next";
import { requireUser } from "@/modules/auth";
import { AssistantPanel } from "@/modules/campus-assistant";

export const metadata: Metadata = {
  title: "Campus assistant · CampusConnect",
};

export default async function AssistantPage() {
  await requireUser();

  return (
    <AppShell>
      <main className="flex-1 bg-white px-4 py-6 sm:py-10">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
          <div>
            <h1 className="text-2xl font-bold text-[var(--ink)]">Campus assistant</h1>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              Ask a question about AUB. Answers are drawn from official AUB pages and the course catalogue, and link to their sources. Check the
              source before relying on a deadline or fee.
            </p>
          </div>
          <AssistantPanel />
        </div>
      </main>
    </AppShell>
  );
}
