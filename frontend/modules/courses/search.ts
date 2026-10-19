import { parseComparisonSelection } from "./codes";

export const COURSES_PER_PAGE = 24;
export const COURSE_RANGE_FILTERS = [
  { name: "Credits", minimum: "creditsMin", maximum: "creditsMax", min: 0, max: 999.99, step: 0.01 },
  { name: "Difficulty", minimum: "difficultyMin", maximum: "difficultyMax", min: 1, max: 5, step: 0.1 },
  { name: "Workload", minimum: "workloadMin", maximum: "workloadMax", min: 1, max: 5, step: 0.1 },
] as const;
type RangeKey = typeof COURSE_RANGE_FILTERS[number]["minimum" | "maximum"];

export type CourseSearchParams = Record<string, string | string[] | undefined>;
export type CourseFilters = { query: string; department: string; page: number; compare?: string[] } & Partial<Record<RangeKey, number>>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export function parseCourseFilters(params: CourseSearchParams): CourseFilters {
  const page = Number(first(params.page));
  const filters: CourseFilters = {
    query: first(params.q).replace(/\s+/g, " ").trim().slice(0, 120),
    department: first(params.department).trim().slice(0, 200),
    page: Number.isSafeInteger(page) && page > 0 ? Math.min(page, 10000) : 1,
  };
  const { codes } = parseComparisonSelection(params.compare);
  if (codes.length) filters.compare = codes;
  for (const range of COURSE_RANGE_FILTERS) {
    for (const key of [range.minimum, range.maximum]) {
      const input = first(params[key]).trim();
      const pattern = range.name === "Credits" ? /^\d+(?:\.\d{1,2})?$/ : /^\d+(?:\.\d)?$/;
      if (!pattern.test(input)) continue;
      const value = Number(input);
      if (Number.isFinite(value) && value >= range.min && value <= range.max) filters[key] = value;
    }
  }
  return filters;
}

export function courseFilterError(filters: CourseFilters): string | undefined {
  for (const range of COURSE_RANGE_FILTERS) {
    const minimum = filters[range.minimum];
    const maximum = filters[range.maximum];
    if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
      return `${range.name}: the minimum cannot be greater than the maximum.`;
    }
  }
}

export function hasRatingFilters(filters: CourseFilters) {
  return filters.difficultyMin !== undefined || filters.difficultyMax !== undefined
    || filters.workloadMin !== undefined || filters.workloadMax !== undefined;
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
  for (const code of parseComparisonSelection(filters.compare).codes) params.append("compare", code);
  for (const range of COURSE_RANGE_FILTERS) {
    for (const key of [range.minimum, range.maximum]) {
      if (filters[key] !== undefined) params.set(key, String(filters[key]));
    }
  }
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/courses?${query}` : "/courses";
}
