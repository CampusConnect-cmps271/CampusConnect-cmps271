import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/modules/auth";
import { log } from "@/modules/logging";
import { COURSES_PER_PAGE, COURSE_RANGE_FILTERS, courseFilterError, courseSearchExpression, hasRatingFilters, type CourseFilters } from "./search";

export type Course = {
  id: string;
  code: string;
  name: string;
  credits: number;
  description: string;
  department: string;
};

type Client = Awaited<ReturnType<typeof createClient>>;
type CoursePage = { courses: Course[]; total: number; page: number; pages: number; filterError?: string };

export class CatalogueUnavailable extends Error {
  constructor() {
    super("The course catalogue is temporarily unavailable.");
    this.name = "CatalogueUnavailable";
  }
}

function failed(error: { code?: string } | null): never {
  log.error("courses.catalogue.read_failure", { code: error?.code ?? "unknown" });
  throw new CatalogueUnavailable();
}

async function loadDepartments(client: Client) {
  const departments = new Set<string>();
  // Supabase caps results at 1,000 rows. Page the narrow projection so later
  // departments are not silently omitted from the selector.
  const batchSize = 1000;
  for (let offset = 0; ; offset += batchSize) {
    const { data, error } = await client.from("courses").select("department")
      .order("department").order("id").range(offset, offset + batchSize - 1);
    if (error || !data) failed(error);
    for (const row of data) departments.add(row.department);
    if (data.length < batchSize) break;
  }
  return [...departments].sort((a, b) => a.localeCompare(b));
}

async function loadCourses(client: Client, filters: CourseFilters): Promise<CoursePage> {
  const filterError = courseFilterError(filters);
  if (filterError) return { courses: [] as Course[], total: 0, page: 1, pages: 1, filterError };
  function filtered(head = false) {
    // Rating predicates must apply before counting and pagination, not to only
    // the visible page. The view uses the caller's RLS and displayed averages.
    let query = client.from(hasRatingFilters(filters) ? "course_filter_catalogue" : "courses").select(
      "id,code,name,credits,description,department", { count: "exact", head },
    );
    if (filters.department) query = query.eq("department", filters.department);
    if (filters.query) query = query.or(courseSearchExpression(filters.query));
    for (const range of COURSE_RANGE_FILTERS) {
      const column = range.name.toLowerCase();
      const minimum = filters[range.minimum];
      const maximum = filters[range.maximum];
      if (minimum !== undefined) query = query.gte(column, minimum);
      if (maximum !== undefined) query = query.lte(column, maximum);
    }
    return query;
  }

  // Count first to clamp stale/bookmarked page numbers before requesting a
  // range; PostgREST rejects ranges beyond the end of a nonempty result set.
  const { count, error } = await filtered(true);
  if (error || count === null) failed(error);
  const pages = Math.max(1, Math.ceil(count / COURSES_PER_PAGE));
  const page = Math.min(filters.page, pages);
  if (count === 0) return { courses: [] as Course[], total: 0, page, pages };
  const start = (page - 1) * COURSES_PER_PAGE;
  const result = await filtered().order("department").order("code").order("id")
    .range(start, start + COURSES_PER_PAGE - 1);
  if (result.error || !result.data) failed(result.error);
  return { courses: result.data as Course[], total: count, page, pages };
}

export async function getCourseCatalogue(filters: CourseFilters) {
  // Guard the data entry point as well as the page, using the student's RLS
  // client. Catalogue browsing never needs a service-role key.
  await requireUser();
  try {
    const client = await createClient();
    const [departments, result] = await Promise.all([
      loadDepartments(client), loadCourses(client, filters),
    ]);
    return { ...result, departments };
  } catch (error) {
    if (error instanceof CatalogueUnavailable) throw error;
    // Transport/configuration failures get the same safe retry UI. Auth
    // redirects above are intentionally outside this catch.
    failed({ code: "connection_failure" });
  }
}
