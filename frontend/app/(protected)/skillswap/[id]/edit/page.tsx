import { AppShell } from "@/components/AppShell";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/modules/auth";
import { getSkillSwapForEdit, SkillSwapForm, updateSkillSwapPost } from "@/modules/skillswap";

export const metadata: Metadata = {
  title: "Edit skill swap · CampusConnect",
};

type EditSkillSwapPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditSkillSwapPage({ params }: EditSkillSwapPageProps) {
  await requireUser();
  const { id } = await params;

  // Only the author's published SkillSwap posts; anything else is not found.
  const swap = await getSkillSwapForEdit(id);
  if (!swap) notFound();

  return (
    <AppShell>
<main className="flex-1 bg-white px-4 py-6 sm:py-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <Link href={`/posts/${swap.postId}`} className="text-sm font-medium text-[var(--maroon)] hover:underline">
          ← Back to post
        </Link>

        <h1 className="text-2xl font-bold text-[var(--ink)]">Edit skill swap</h1>

        <SkillSwapForm
          action={updateSkillSwapPost.bind(null, swap.postId)}
          initialValues={{
            canTeach: swap.canTeach,
            wantsToLearn: swap.wantsToLearn,
            meetingMethod: swap.meetingMethod,
            availability: swap.availability ?? "",
            details: swap.details ?? "",
          }}
          submitLabel="Save changes"
          pendingLabel="Saving…"
          cancelHref={`/posts/${swap.postId}`}
        />
      </div>
    </main>
</AppShell>
  );
}
