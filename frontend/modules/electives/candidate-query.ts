import "server-only";
import type { ElectivePreferences } from "./schema";
import type { Candidate } from "./types";
import { preferenceGroups, tokens } from "./preference-matching";
import { matchingOffering } from "./offering-matches";
import type { CandidateCatalogue, CandidateDiagnostics } from "./candidate-cache";
export type CandidateClient = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };
export function candidateQuery(preferences?: ElectivePreferences) {
  return { p_groups: preferences ? preferenceGroups(preferences.interests).map(g => g.words) : [], p_filters: preferences?.offering_preferences ?? {} };
}
export async function fetchCandidateCatalogue(client: CandidateClient, preferences?: ElectivePreferences): Promise<{ value: CandidateCatalogue; diagnostics: CandidateDiagnostics }> {
  const started = performance.now();
  const courses: Candidate[] = [];
  const query = candidateQuery(preferences);
  const groups = preferences ? preferenceGroups(preferences.interests) : [];
  let catalogueCount = 0, requests = 0, bytes = 0;
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.rpc("elective_candidate_page", { ...query, p_offset: offset, p_limit: 1000 });
    requests++;
    if (error || !data) throw new Error("The course catalogue is temporarily unavailable.");
    const page = data as { catalogue_count: number; candidate_count: number; courses: Candidate[] };
    if (!Array.isArray(page.courses) || !Number.isSafeInteger(page.catalogue_count) || !Number.isSafeInteger(page.candidate_count) || page.catalogue_count < 0 || page.candidate_count < 0 || page.courses.length > 1000) throw new Error("The course catalogue is temporarily unavailable.");
    bytes += Buffer.byteLength(JSON.stringify(page));
    catalogueCount = page.catalogue_count;
    for (const row of page.courses) {
      // The SQL interest prefilter is intentionally broad. Keep exact Unicode
      // whole-token matching here, before ranking or sending facts to a model.
      if (groups.length) {
        const corpus = new Set(tokens(`${row.name} ${row.department} ${row.description}`.slice(0, 20000)));
        if (!groups.some(g => g.words.every(w => corpus.has(w)))) continue;
      }
      const offering = matchingOffering(row.offering ?? undefined, preferences?.offering_preferences);
      if (preferences?.offering_preferences?.semester_id && !offering) continue;
      courses.push({ ...row, credits: Number(row.credits), review_count: row.review_count === null ? null : Number(row.review_count),
        average_workload: row.average_workload === null ? null : Number(row.average_workload),
        average_overall: row.average_overall === null ? null : Number(row.average_overall),
        offering: offering ?? undefined });
    }
    if (offset + page.courses.length >= page.candidate_count) break;
    if (!page.courses.length) throw new Error("The course catalogue is temporarily unavailable.");
  }
  return { value: { courses, truncated: false, catalogueCount }, diagnostics: { cache: "miss", dbRequests: requests, responseBytes: bytes, queryMs: performance.now() - started } };
}
