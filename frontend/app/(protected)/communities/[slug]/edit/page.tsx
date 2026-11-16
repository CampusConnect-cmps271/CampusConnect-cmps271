import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/modules/auth";
import { CommunityForm, getCommunityBySlug, updateCommunity } from "@/modules/communities";

type EditCommunityPageProps = {
  params: Promise<{ slug: string }>;
};

export const metadata: Metadata = {
  title: "Edit community · CampusConnect",
};

export default async function EditCommunityPage({ params }: EditCommunityPageProps) {
  const user = await requireUser();
  const { slug } = await params;
  const community = await getCommunityBySlug(slug);
  if (!community) notFound();
  // Only the owner edits, and only while the community is active.
  if (community.ownerId !== user.id || community.status !== "active") redirect(`/communities/${community.slug}`);

  const back = `/communities/${community.slug}`;
  return (
    <AppShell>
      <main className="flex-1 px-4 py-6 sm:py-10">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
          <Link href={back} className="text-sm font-medium text-[var(--maroon)] hover:underline">
            ← {community.name}
          </Link>
          <h1 className="text-2xl font-bold text-[var(--ink)]">Edit details</h1>
          <CommunityForm
            action={updateCommunity.bind(null, community.id, community.slug)}
            initialValues={{
              name: community.name,
              description: community.description ?? "",
              topic: community.topic,
              courseId: community.courseId ?? "",
              courseLabel: community.courseCode ? `${community.courseCode} · ${community.courseName ?? ""}` : "",
            }}
            submitLabel="Save changes"
            pendingLabel="Saving…"
            cancelHref={back}
          />
        </div>
      </main>
    </AppShell>
  );
}
