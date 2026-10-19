export const COURSES_PER_PAGE = 24;

export type CourseSearchParams = Record<string, string | string[] | undefined>;
export type CourseFilters = { query: string; department: string; page: number };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export function parseCourseFilters(params: CourseSearchParams): CourseFilters {
  const page = Number(first(params.page));
  return {
    query: first(params.q).replace(/\s+/g, " ").trim().slice(0, 120),
    department: first(params.department).trim().slice(0, 200),
    page: Number.isSafeInteger(page) && page > 0 ? Math.min(page, 10000) : 1,
  };
}

/** Quote PostgREST values so commas, parentheses and quotes remain search text. */
function searchPattern(text: string) {
  const literal = text.replace(/[\\%_]/g, "\\$&");
  return JSON.stringify(`%${literal}%`);
}

export function courseSearchExpression(query: string) {
  // Students commonly paste compact codes such as CMPS240 or BIOC303B.
  const code = query.replace(/^([a-z]{2,8})\s*(\d{3}[a-z]?)$/i, "$1 $2");
  return `code.ilike.${searchPattern(code)},name.ilike.${searchPattern(query)}`;
}

export function coursesUrl(filters: CourseFilters, page = filters.page) {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.department) params.set("department", filters.department);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/courses?${query}` : "/courses";
}
