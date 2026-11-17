import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/modules/auth";
import { CommunityForm, createCommunity, EMPTY_COMMUNITY_FORM, findCourseByCode } from "@/modules/communities";

export const metadata: Metadata = {
  title: "Start a community · CampusConnect",
};

type NewCommunityPageProps = {
  searchParams: Promise<{ course?: string | string[] }>;
};

export default async function NewCommunityPage({ searchParams }: NewCommunityPageProps) {
  await requireUser();
  // "Start the first community for CMPS 271" links here with ?course=CMPS-271.
  const { course: code } = await searchParams;
  const course = typeof code === "string" ? await findCourseByCode(code) : null;
  const initialValues = course
    ? { ...EMPTY_COMMUNITY_FORM, topic: "course", courseId: course.id, courseLabel: `${course.code} · ${course.name}` }
    : EMPTY_COMMUNITY_FORM;

  return (
    <AppShell>
      <main className="flex-1 px-4 py-6 sm:py-10">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
          <Link href="/communities" className="text-sm font-medium text-[var(--maroon)] hover:underline">
            ← Communities
          </Link>
          <h1 className="text-2xl font-bold text-[var(--ink)]">Start a community</h1>
          <CommunityForm
            action={createCommunity}
            initialValues={initialValues}
            submitLabel="Create community"
            pendingLabel="Creating…"
            cancelHref="/communities"
            suggestExisting
          />
        </div>
      </main>
    </AppShell>
  );
}
