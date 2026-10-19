import { AppShell } from "@/components/AppShell";
import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/modules/auth";
import { createSkillSwapPost, EMPTY_SKILLSWAP_FORM, SkillSwapForm } from "@/modules/skillswap";

export const metadata: Metadata = {
  title: "Offer a skill swap · CampusConnect",
};

export default async function NewSkillSwapPage() {
  await requireUser();

  return (
    <AppShell>
<main className="flex-1 bg-white px-4 py-6 sm:py-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <Link href="/skillswap" className="text-sm font-medium text-[var(--maroon)] hover:underline">
          ← SkillSwap board
        </Link>

        <div>
          <h1 className="text-2xl font-bold text-[var(--ink)]">Offer a skill swap</h1>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">
            Say what you can teach and what you&apos;d like to learn. Students who are a good fit
            can message you to arrange it.
          </p>
        </div>

        <SkillSwapForm
          action={createSkillSwapPost}
          initialValues={EMPTY_SKILLSWAP_FORM}
          submitLabel="Post skill swap"
          pendingLabel="Posting…"
          cancelHref="/skillswap"
        />
      </div>
    </main>
</AppShell>
  );
}
