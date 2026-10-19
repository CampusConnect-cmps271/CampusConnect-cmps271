import { MAX_COMPARISON_COURSES, normalizeCourseCode, parseComparisonSelection } from "./codes";
import { coursesUrl, type CourseFilters } from "./search";

export function comparisonUrl(filters: CourseFilters) {
  return coursesUrl(filters).replace(/^\/courses/, "/courses/compare");
}

export function toggleComparison(filters: CourseFilters, value: string): CourseFilters {
  const codes = parseComparisonSelection(filters.compare).codes;
  const code = normalizeCourseCode(value);
  if (!code) return filters;
  const compare = codes.includes(code) ? codes.filter((item) => item !== code)
    : codes.length < MAX_COMPARISON_COURSES ? [...codes, code] : codes;
  return { ...filters, compare };
}
