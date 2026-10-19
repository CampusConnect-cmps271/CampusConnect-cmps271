import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/modules/auth";
import { log } from "@/modules/logging";
import { COURSES_PER_PAGE, courseSearchExpression, type CourseFilters } from "./search";

export type Course = {
  id: string;
  code: string;
  name: string;
  credits: number;
  description: string;
  department: string;
};

type Client = Awaited<ReturnType<typeof createClient>>;

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

async function loadCourses(client: Client, filters: CourseFilters) {
  function filtered(head = false) {
    let query = client.from("courses").select(
      "id,code,name,credits,description,department", { count: "exact", head },
    );
    if (filters.department) query = query.eq("department", filters.department);
    if (filters.query) query = query.or(courseSearchExpression(filters.query));
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
