import "server-only";
import { unstable_cache, updateTag } from "next/cache";
import { requireUser } from "@/modules/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { traceCoursePhase } from "@/modules/performance/course-tracing";
import { log } from "@/modules/logging";
import { COURSE_CATALOGUE_TAG } from "./cache-tags";
import { formatCatalogueBundle, readCatalogueBundle, type CatalogueBundle } from "./catalogue-bundle";
import { hasRatingFilters, courseFilterError, type CourseFilters } from "./search";

const REVALIDATE_SECONDS = 60;
const MAX_STALE_MS = 120_000;
const MAX_PENDING = 128;
type CachedBundle = { loadedAt: number; bundle: CatalogueBundle };

// Only globally readable catalogue fields and published rating aggregates enter
// this cache. No caller client, cookie, token, profile or private review is used.
// The service-only RPC explicitly excludes inactive semester imports.
const readCached = unstable_cache(async (project: string, filters: CourseFilters): Promise<CachedBundle> => {
  if (project !== process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) throw new Error("Cache project changed");
  const bundle = await readCatalogueBundle(createAdminClient(), filters, "read_shared_course_catalogue");
  if (bundle.ratings === null) throw new Error("Incomplete catalogue bundle");
  return { loadedAt: Date.now(), bundle };
}, ["shared-course-catalogue-v1"], { revalidate: REVALIDATE_SECONDS, tags: [COURSE_CATALOGUE_TAG] });

const pending = new Map<string, Promise<CachedBundle>>();
let retryAfter = 0;

/** Authenticate on hits too. Cache failure falls back to the caller's RLS read. */
export async function loadSharedCatalogueBundle(filters: CourseFilters) {
  await requireUser();
  if (filters.semester || hasRatingFilters(filters) || courseFilterError(filters)) return null;
  const project = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (process.env.COURSE_CATALOGUE_CACHE_ENABLED === "false" || !project || !process.env.SUPABASE_SECRET_KEY?.trim()) return null;

  // Comparison selection changes presentation, not catalogue data. Canonical
  // arguments avoid creating separate entries for equivalent searches.
  const keyFilters: CourseFilters = {
    query: filters.query.replace(/\s+/g, " ").trim().replace(/[A-Z]/g, (letter) => letter.toLowerCase()),
    department: filters.department, page: filters.page,
    ...(filters.creditsMin !== undefined ? { creditsMin: filters.creditsMin } : {}),
    ...(filters.creditsMax !== undefined ? { creditsMax: filters.creditsMax } : {}),
  };
  if (Date.now() < retryAfter) return null;
  const key = JSON.stringify([project, keyFilters]);
  let request = pending.get(key);
  if (!request) {
    request = traceCoursePhase("catalogue_cache", () => readCached(project, keyFilters));
    if (pending.size < MAX_PENDING) pending.set(key, request);
  }
  try {
    const result = await request;
    // Time revalidation may serve stale data during a backend outage. Bound
    // that behavior; an old entry must not hide an ongoing failure forever.
    if (Date.now() - result.loadedAt > MAX_STALE_MS) return null;
    // Formatting creates fresh Maps/arrays so a caller cannot mutate the cache.
    return formatCatalogueBundle(structuredClone(result.bundle));
  } catch {
    if (Date.now() >= retryAfter) log.warn("courses.cache.unavailable", { code: "read_failure" });
    retryAfter = Date.now() + 10_000;
    return null;
  } finally {
    if (pending.get(key) === request) pending.delete(key);
  }
}

/** Server Actions only: review writes/moderation must be visible immediately. */
export function invalidateSharedCourseCatalogue() {
  pending.clear();
  retryAfter = 0;
  updateTag(COURSE_CATALOGUE_TAG);
}
