import { MAX_COURSE_EVIDENCE, MAX_PAGE_EVIDENCE, type EvidenceChunk } from "./schema";

const MAX_TERMS = 12;
/** Words that appear in nearly every chunk and so say nothing about the topic. */
const STOP_WORDS = new Set(
  ("a an and are as at be by can do does for from has have how i in is it me my of on or the to us was what when where which who why will with you your " +
    "course courses " +
    "ما هي هو من في على إلى عن هل كيف متى أين").split(" "),
);

/**
 * The searchable words of a question: letters and digits in any script (so
 * Arabic works), lower-cased, without filler words. A course code written
 * "CMPS271" is split into "cmps" and "271", as the catalogue stores it. Postgres
 * matches any term and ranks the rows that match most first.
 */
export function searchTerms(question: string): string[] {
  const words = (question.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).flatMap(
    (word) => word.match(/\p{L}+|\p{N}+/gu) ?? [],
  );
  return [...new Set(words.filter((word) => !STOP_WORDS.has(word) && word.length > 1))].slice(0, MAX_TERMS);
}

type CourseRow = {
  code: string;
  name: string;
  department: string;
  credits: number | string;
  prerequisites: string;
  description: string;
};

/** The slice of a Supabase client that retrieval needs. */
export type RpcClient = {
  rpc(
    fn: "search_campus_chunks" | "search_campus_courses",
    args: { p_query: string; p_limit: number },
  ): PromiseLike<{ data: unknown[] | null; error: { code?: string } | null }>;
};

/** A catalogue course as evidence, linked to the app's own course page. */
function courseEvidence(course: CourseRow): EvidenceChunk {
  const credits = Number(course.credits);
  return {
    chunk_id: `course:${course.code}`,
    source_id: "course-catalogue",
    url: `/courses/${encodeURIComponent(course.code.replace(/ /g, "-"))}`,
    title: `${course.code} · ${course.name}`,
    retrieved_at: null,
    text:
      `Course ${course.code}: ${course.name}. Department: ${course.department}. Credits: ${credits}. ` +
      `Prerequisites: ${course.prerequisites.trim() || "none listed"}. Description: ${course.description}`,
  };
}

/**
 * Looks the question up in the stored AUB pages and in the course catalogue,
 * with the caller's own session so row-level security applies. Returns page
 * chunks first, then courses.
 */
export async function retrieveEvidence(client: RpcClient, question: string): Promise<EvidenceChunk[]> {
  const terms = searchTerms(question);
  if (terms.length === 0) return [];

  const p_query = terms.join(" ");
  const [pages, courses] = await Promise.all([
    client.rpc("search_campus_chunks", { p_query, p_limit: MAX_PAGE_EVIDENCE }),
    client.rpc("search_campus_courses", { p_query, p_limit: MAX_COURSE_EVIDENCE }),
  ]);
  for (const { error } of [pages, courses]) {
    if (error) throw new Error(`Source search failed (database code: ${error.code ?? "unknown"}).`);
  }

  return [...((pages.data ?? []) as EvidenceChunk[]), ...((courses.data ?? []) as CourseRow[]).map(courseEvidence)];
}
