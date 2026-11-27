import "server-only";
import { z } from "zod";
import type { createClient } from "@/lib/supabase/server";
import { traceCoursePhase } from "@/modules/performance/course-tracing";
import { log } from "@/modules/logging";
import { ratingRowSchema, summarizeRating, type RatingSummary } from "@/modules/ratings/model";
import type { CourseFilters } from "./search";

const bundleSchema = z.object({
  courses: z.array(z.object({
    id: z.uuid(), code: z.string(), name: z.string(), department: z.string(),
    description: z.string(), credits: z.number().finite(),
  })).max(24),
  total: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  page: z.number().int().positive(), pages: z.number().int().positive(),
  departments: z.array(z.string()),
  semesters: z.array(z.object({ id: z.string(), name: z.string(), synced_at: z.string() })),
  ratings: z.unknown(),
}).refine((value) => value.page <= value.pages && value.pages === Math.max(1, Math.ceil(value.total / 24)));

export class CatalogueBundleError extends Error {
  constructor(readonly code: string) { super("Catalogue bundle unavailable"); }
}

/** Base catalogue only. Rich semester/rating filters retain their existing query path. */
export async function readCatalogueBundle(client: Pick<Awaited<ReturnType<typeof createClient>>, "rpc">, filters: CourseFilters, rpc = "browse_course_catalogue") {
  const { data, error } = await traceCoursePhase("catalogue_rpc", async () => await client.rpc(rpc, {
    p_query: filters.query,
    p_code_query: filters.query.replace(/^([a-z]{2,8})\s*(\d{3,4}[a-z]{0,3})$/i, "$1 $2"),
    p_department: filters.department, p_page: filters.page,
    p_credits_min: filters.creditsMin ?? null, p_credits_max: filters.creditsMax ?? null,
  }));
  if (error) throw new CatalogueBundleError(error.code ?? "read_failure");
  const parsed = bundleSchema.safeParse(data);
  if (!parsed.success) throw new CatalogueBundleError("invalid_data");
  const { ratings: rows, ...result } = parsed.data;
  const checked = z.array(ratingRowSchema).max(24).safeParse(rows);
  if (!checked.success) log.error("ratings.read_failure", { code: "bundle_unavailable" });
  // Strip unknown properties before anything can enter the shared cache.
  return { ...result, ratings: checked.success ? checked.data : null };
}

export type CatalogueBundle = Awaited<ReturnType<typeof readCatalogueBundle>>;

export function formatCatalogueBundle({ ratings: rows, ...result }: CatalogueBundle) {
  const ratings = new Map<string, RatingSummary>(result.courses.map((course) => [course.id, { status: "unavailable" }]));
  for (const row of rows ?? []) {
    if (ratings.has(row.course_id)) ratings.set(row.course_id, summarizeRating(row));
  }
  return { ...result, departments: result.departments.sort((a, b) => a.localeCompare(b)), ratings };
}

export async function loadCatalogueBundle(client: Awaited<ReturnType<typeof createClient>>, filters: CourseFilters) {
  return formatCatalogueBundle(await readCatalogueBundle(client, filters));
}
