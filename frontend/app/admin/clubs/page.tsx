import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/server";
import { listPendingClubs } from "@/modules/clubs";
import { VerificationQueue } from "@/modules/clubs/components/VerificationQueue";

export const metadata: Metadata = { title: "Club verification · CampusConnect" };

export default async function ClubVerificationPage() {
  await requireRole(["administrator"]); const clubs = await listPendingClubs();
  return <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6"><Link href="/admin" className="text-sm font-semibold text-[var(--maroon)]">← Administration</Link><header className="my-7"><h1 className="text-3xl font-bold">Club verification</h1><p className="mt-2 text-[var(--ink-soft)]">Review representative requests. Every decision is recorded in the audit log.</p></header><VerificationQueue clubs={clubs} /></main>;
}
