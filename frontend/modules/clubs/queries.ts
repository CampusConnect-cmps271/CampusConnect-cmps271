import "server-only";
import { requireUser } from "@/modules/auth";
import { getCurrentUserAndRole } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { log } from "@/modules/logging";
import { CLUB_PAGE_SIZE, escapeLikePattern, type ClubDirectorySearch } from "./search";
import type { ClubAnnouncement, ClubMembership, ClubProfile, ClubSummary } from "./types";

const SUMMARY_COLUMNS = "id,slug,name,description,category,verification_status";
const PROFILE_COLUMNS = `${SUMMARY_COLUMNS},public_email,public_website,verification_reason`;

export class ClubQueryError extends Error {}

export async function listClubs(search: ClubDirectorySearch) {
  await requireUser();
  const supabase = await createClient();
  const from = (search.page - 1) * CLUB_PAGE_SIZE;
  let query = supabase.from("clubs").select(SUMMARY_COLUMNS, { count: "exact" });
  if (search.q) {
    const q = escapeLikePattern(search.q);
    query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`);
  }
  if (search.category) query = query.eq("category", search.category);
  const { data, error, count } = await query
    .order("name", { ascending: true }).order("id", { ascending: true })
    .range(from, from + CLUB_PAGE_SIZE - 1).returns<ClubSummary[]>();
  if (error) {
    log.error("clubs.directory.read_failure", { code: error.code ?? null });
    throw new ClubQueryError("The club directory is temporarily unavailable.");
  }
  return { clubs: data ?? [], total: count ?? 0, hasNext: from + CLUB_PAGE_SIZE < (count ?? 0) };
}

export async function listClubCategories() {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.from("clubs").select("category").order("category");
  if (error) throw new ClubQueryError("Club filters are temporarily unavailable.");
  return [...new Set((data ?? []).map((row) => row.category as string))];
}

export async function getClubBySlug(slug: string): Promise<ClubProfile | null> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.from("clubs").select(PROFILE_COLUMNS).eq("slug", slug).maybeSingle<ClubProfile>();
  if (error) {
    log.error("clubs.profile.read_failure", { slug, code: error.code ?? null });
    throw new ClubQueryError("This club could not be loaded.");
  }
  return data;
}

export async function getClubAccess(clubId: string) {
  const { user, role } = await getCurrentUserAndRole();
  if (!user) return { userId: null, role: null, membership: null, canManage: false };
  const supabase = await createClient();
  const { data } = await supabase.from("club_memberships").select("club_id,user_id,role")
    .eq("club_id", clubId).eq("user_id", user.id).maybeSingle<ClubMembership>();
  return { userId: user.id, role, membership: data, canManage: role === "administrator" || data?.role === "representative" };
}

export async function listClubAnnouncements(clubId: string, includeManaged = false) {
  await requireUser();
  const supabase = await createClient();
  let query = supabase.from("club_announcements")
    .select("id,club_id,author_id,title,body,status,published_at,created_at,updated_at")
    .eq("club_id", clubId);
  if (!includeManaged) query = query.eq("status", "published");
  const { data, error } = await query.order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false }).returns<ClubAnnouncement[]>();
  if (error) throw new ClubQueryError("Club announcements could not be loaded.");
  return data ?? [];
}

export async function getClubAnnouncement(clubId: string, id: string) {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.from("club_announcements")
    .select("id,club_id,author_id,title,body,status,published_at,created_at,updated_at")
    .eq("club_id", clubId).eq("id", id).maybeSingle<ClubAnnouncement>();
  if (error) throw new ClubQueryError("The announcement could not be loaded.");
  return data;
}

export async function listPendingClubs() {
  const { user } = await getCurrentUserAndRole();
  if (!user) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("clubs").select(PROFILE_COLUMNS)
    .eq("verification_status", "pending").order("verification_requested_at", { ascending: true });
  if (error) throw new ClubQueryError("The verification queue could not be loaded.");
  return (data ?? []) as ClubProfile[];
}
