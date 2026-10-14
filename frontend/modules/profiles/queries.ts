import "server-only";
import { cache } from "react";
import { requireUser } from "@/modules/auth";
import { log } from "@/modules/logging";
import { createClient } from "@/lib/supabase/server";
import { profileIdSchema } from "./schema";
import type { Profile } from "./types";

const PROFILE_COLUMNS =
  "id, full_name, major, graduation_year, bio, interests, pinned_post_id";

type ProfileRow = {
  id: string;
  full_name: string;
  major: string | null;
  graduation_year: number | null;
  bio: string | null;
  interests: string[] | null;
  pinned_post_id: string | null;
};

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    fullName: row.full_name,
    major: row.major,
    graduationYear: row.graduation_year,
    bio: row.bio,
    interests: row.interests ?? [],
    pinnedPostId: row.pinned_post_id,
  };
}

/**
 * One student's profile, or null when no student has that id. RLS lets any
 * signed-in student read it. Memoised per request, so a page and its
 * metadata share one lookup.
 */
export const getProfile = cache(async (id: string): Promise<Profile | null> => {
  if (!profileIdSchema.safeParse(id).success) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", id)
    .maybeSingle<ProfileRow>();

  if (error) {
    log.error("profiles.read.failure", {
      profileId: id,
      code: error.code ?? null,
    });
    throw new Error("Failed to load the profile.");
  }

  return data ? toProfile(data) : null;
});

/** The signed-in student's own profile. Redirects a signed-out visitor to login. */
export async function getMyProfile(): Promise<Profile | null> {
  const user = await requireUser();
  return getProfile(user.id);
}

/**
 * Display names for a list of students, keyed by id, for lists such as the
 * feed or an inbox. Ids without a profile are left out, so callers should
 * fall back to a generic label. A failed lookup returns no names rather than
 * breaking the list.
 */
export async function getDisplayNames(
  ids: readonly string[],
): Promise<Record<string, string>> {
  const unique = [...new Set(ids)].filter(
    (id) => profileIdSchema.safeParse(id).success,
  );

  if (unique.length === 0) return {};

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", unique);

  if (error || !data) {
    log.error("profiles.display_names.read_failure", {
      count: unique.length,
      code: error?.code ?? null,
    });
    return {};
  }

  return Object.fromEntries(
    (data as { id: string; full_name: string }[]).map((row) => [
      row.id,
      row.full_name,
    ]),
  );
}
