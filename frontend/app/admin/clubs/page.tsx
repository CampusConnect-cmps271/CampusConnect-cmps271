import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/server";
import { listPendingClubs } from "@/modules/clubs";
import { VerificationQueue } from "@/modules/clubs/components/VerificationQueue";
import { AdminPageShell } from "@/components/AdminPageShell";

export const metadata: Metadata = { title: "Club verification · CampusConnect" };

export default async function ClubVerificationPage() {
  await requireRole(["administrator"]); const clubs = await listPendingClubs();
  return <AdminPageShell title="Club verification" description="Review representative requests and record a clear reason for every decision." maxWidth="max-w-4xl"><VerificationQueue clubs={clubs} /></AdminPageShell>;
}
