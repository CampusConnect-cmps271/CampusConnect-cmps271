import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireUser, type CurrentUser } from "@/modules/auth";
import type { ElectivePreferences } from "./schema";
import { candidateCache, candidateCacheKey } from "./candidate-cache";
import { candidateQuery, fetchCandidateCatalogue } from "./candidate-query";

export async function loadCandidates(preferences?: ElectivePreferences) {
  // Authentication is always checked, including cache hits. All DB work uses
  // the student's authenticated client and existing RLS; no service credentials.
  const user = await requireUser();
  return loadCandidatesForUser(preferences, user);
}

/** Only called with the user already verified for this server request. */
export async function loadCandidatesForUser(preferences: ElectivePreferences | undefined, user: CurrentUser) {
  const client = await createClient();
  const result = await candidateCache.load(candidateCacheKey(user.id, candidateQuery(preferences)), () => fetchCandidateCatalogue(client, preferences));
  return { ...result.value, diagnostics: result.diagnostics };
}
