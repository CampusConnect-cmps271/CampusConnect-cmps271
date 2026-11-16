import { formatBeirutTime } from "./beirut-time";
import { MAX_CLUB_EVIDENCE, MAX_COURSE_EVIDENCE, MAX_EVENT_EVIDENCE, MAX_PAGE_EVIDENCE, type EvidenceChunk } from "./schema";

const MAX_TERMS = 12;
/** Words that appear in nearly every chunk and so say nothing about the topic. */
const STOP_WORDS = new Set(
  ("a an and are as at be by can do does for from has have how i in is it me my of on or the to us was what when where which who why will with you your " +
    "course courses prerequisite prerequisites pre requisite prereq prereqs " +
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

type ClubRow = {
  slug: string;
  name: string;
  category: string;
  description: string;
  public_website: string | null;
};

type EventRow = {
  id: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  location: string;
  category: string;
  club_name: string | null;
  registration_url: string | null;
};

type SearchFunction =
  | "search_campus_chunks"
  | "search_campus_courses"
  | "search_campus_clubs"
  | "search_campus_events"
  | "search_campus_chunks_semantic"
  | "search_campus_courses_semantic"
  | "search_campus_clubs_semantic"
  | "search_campus_events_semantic";

/** The slice of a Supabase client that retrieval needs. */
export type RpcClient = {
  rpc(
    fn: SearchFunction,
    args: { p_query: string; p_limit: number } | { p_embedding: string; p_limit: number },
  ): PromiseLike<{ data: unknown[] | null; error: { code?: string } | null }>;
};

/** Each list is asked for this many candidates before the lists are merged down to the evidence limits. */
const CANDIDATES = 10;
/** The usual rank-fusion constant: higher keeps the top of each list from dominating. */
const RANK_FUSION_K = 60;

/**
 * Merges ranked lists into one: an item scores 1 / (K + rank) in every list that
 * has it, so items found by both the keyword and the meaning search rise to the
 * top while each list's own order still counts. Ties keep first-seen order.
 */
export function reciprocalRankFusion<T>(lists: T[][], key: (item: T) => string, limit: number): T[] {
  const scored = new Map<string, { item: T; score: number; order: number }>();
  for (const list of lists) {
    list.forEach((item, rank) => {
      const id = key(item);
      const entry = scored.get(id) ?? { item, score: 0, order: scored.size };
      entry.score += 1 / (RANK_FUSION_K + rank + 1);
      scored.set(id, entry);
    });
  }
  return [...scored.values()]
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map((entry) => entry.item);
}

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

/** A verified club as evidence, linked to the app's own club page. */
function clubEvidence(club: ClubRow): EvidenceChunk {
  return {
    chunk_id: `club:${club.slug}`,
    source_id: "club-directory",
    url: `/clubs/${club.slug}`,
    title: `${club.name} (club)`,
    retrieved_at: null,
    text:
      `Club ${club.name}. Category: ${club.category}. Description: ${club.description}` +
      (club.public_website ? ` Website: ${club.public_website}` : ""),
  };
}

/** An upcoming published event as evidence, with its time in Beirut, linked to the app's own event page. */
function eventEvidence(event: EventRow): EvidenceChunk {
  const when = `${formatBeirutTime(event.starts_at)} to ${formatBeirutTime(event.ends_at)} (Beirut time)`;
  return {
    chunk_id: `event:${event.id}`,
    source_id: "campus-events",
    url: `/events/${event.id}`,
    title: `${event.title} (event)`,
    retrieved_at: null,
    text:
      `Event ${event.title}${event.club_name ? `, organised by ${event.club_name}` : ""}. Category: ${event.category}. ` +
      `When: ${when}. Where: ${event.location}. Registration: ${event.registration_url ?? "none listed"}. ` +
      `Description: ${event.description.trim() || "none"}`,
  };
}

/**
 * Looks the question up in the stored AUB pages, the course catalogue, the
 * verified clubs and the upcoming events, with the caller's own session so
 * row-level security applies. Returns page chunks first, then courses, clubs
 * and events. Club and event search only add to the answer: if they fail (the
 * migration is missing on a project, say) the pages and courses still answer.
 */
export async function retrieveEvidence(
  client: RpcClient,
  question: string,
  embedding?: number[] | null,
): Promise<EvidenceChunk[]> {
  const terms = searchTerms(question);
  if (terms.length === 0) return [];

  const p_query = terms.join(" ");
  const p_embedding = embedding ? `[${embedding.join(",")}]` : null;
  const keywordPages = p_embedding ? CANDIDATES : MAX_PAGE_EVIDENCE;
  const keywordCourses = p_embedding ? CANDIDATES : MAX_COURSE_EVIDENCE;
  const [pages, courses, meaningPages, meaningCourses, clubs, events, meaningClubs, meaningEvents] = await Promise.all([
    client.rpc("search_campus_chunks", { p_query, p_limit: keywordPages }),
    client.rpc("search_campus_courses", { p_query, p_limit: keywordCourses }),
    p_embedding ? client.rpc("search_campus_chunks_semantic", { p_embedding, p_limit: CANDIDATES }) : null,
    p_embedding ? client.rpc("search_campus_courses_semantic", { p_embedding, p_limit: CANDIDATES }) : null,
    client.rpc("search_campus_clubs", { p_query, p_limit: p_embedding ? CANDIDATES : MAX_CLUB_EVIDENCE }),
    client.rpc("search_campus_events", { p_query, p_limit: p_embedding ? CANDIDATES : MAX_EVENT_EVIDENCE }),
    p_embedding ? client.rpc("search_campus_clubs_semantic", { p_embedding, p_limit: CANDIDATES }) : null,
    p_embedding ? client.rpc("search_campus_events_semantic", { p_embedding, p_limit: CANDIDATES }) : null,
  ]);
  for (const { error } of [pages, courses]) {
    if (error) throw new Error(`Source search failed (database code: ${error.code ?? "unknown"}).`);
  }
  // The meaning search only adds to the keyword results: if it fails (the
  // migration is missing, say) the student still gets the keyword answer.
  const semanticRows = <T>(result: typeof meaningPages) => ((result && !result.error ? result.data : null) ?? []) as T[];

  const mergedPages = reciprocalRankFusion(
    [(pages.data ?? []) as EvidenceChunk[], semanticRows<EvidenceChunk>(meaningPages)],
    (chunk) => chunk.chunk_id,
    MAX_PAGE_EVIDENCE,
  );
  const keywordCourseRows = (courses.data ?? []) as CourseRow[];
  const mergedCourses = reciprocalRankFusion(
    [keywordCourseRows, semanticRows<CourseRow>(meaningCourses)],
    (course) => course.code,
    MAX_COURSE_EVIDENCE,
  );
  // A course the question names by its code goes first, as the keyword search
  // ranks it, whatever the meaning search thinks of the other courses.
  const named = keywordCourseRows.filter((course) => p_query.includes(course.code.toLowerCase()));
  const orderedCourses = [...new Map([...named, ...mergedCourses].map((course) => [course.code, course])).values()].slice(0, MAX_COURSE_EVIDENCE);
  const mergedClubs = reciprocalRankFusion(
    [semanticRows<ClubRow>(clubs), semanticRows<ClubRow>(meaningClubs)],
    (club) => club.slug,
    MAX_CLUB_EVIDENCE,
  );
  const mergedEvents = reciprocalRankFusion(
    [semanticRows<EventRow>(events), semanticRows<EventRow>(meaningEvents)],
    (event) => event.id,
    MAX_EVENT_EVIDENCE,
  );
  return [
    ...mergedPages,
    ...orderedCourses.map(courseEvidence),
    ...mergedClubs.map(clubEvidence),
    ...mergedEvents.map(eventEvidence),
  ];
}
