/**
 * Decides whether a question is about the student's own plan, events or posts.
 *
 * Only then does the assistant read that private data and send it to the
 * answer model, so a question about library hours never carries a timetable
 * with it. This is a deliberately narrow heuristic, not a classifier: it asks
 * for the first person *and* a topic ("my schedule", "did I save"), so
 * "How do I request a transcript?" stays public. It can miss an oddly worded
 * personal question; the cost is a less personal answer, never a leak.
 */

/** Things in the app a student can have of their own. */
const TOPICS = new Set([
  "plan", "plans", "planner", "schedule", "schedules", "timetable", "calendar",
  "class", "classes", "lecture", "lectures", "semester", "term", "exam", "exams",
  "midterm", "midterms", "deadline", "deadlines", "course", "courses", "credits",
  "event", "events", "going", "saved", "bookmark", "bookmarks", "feed",
  "post", "posts", "today", "tomorrow", "tonight", "week", "busy", "free",
  "conflict", "conflicts", "clash", "overlap",
]);

/** Phrases that put the student in the sentence without saying "my". */
const PHRASES = [
  "am i free", "am i busy", "am i going", "am i taking", "am i enrolled", "am i registered", "am i available",
  "i m going", "i m taking", "i m free", "i m busy", "i am going", "i am taking", "i am free", "i am busy",
  "should i take", "should i drop", "should i add",
  "did i save", "i saved", "i bookmarked", "i posted", "i post", "i wrote",
];

/** "Do I have class tomorrow": a first-person opener that needs a topic after it. */
const OPENERS = ["do i have", "have i", "i have"];

/** Arabic nouns that already carry "my" as a suffix. */
const ARABIC_MINE = new Set([
  "خطتي", "جدولي", "موادي", "مقرراتي", "فعالياتي", "منشوراتي", "محفوظاتي", "تقويمي", "حصصي", "مواعيدي",
]);
const ARABIC_HAVE = new Set(["عندي", "لدي"]);
const ARABIC_TOPICS = new Set([
  "محاضرة", "محاضرات", "امتحان", "امتحانات", "فعالية", "فعاليات", "جدول", "خطة",
  "مادة", "مواد", "مقرر", "مقررات", "تعارض", "اليوم", "غدا",
]);

export function isPersonalQuestion(question: string): boolean {
  const tokens: string[] = question.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  if (tokens.length === 0) return false;

  const has = (word: string) => tokens.includes(word);
  const hasTopic = tokens.some((token) => TOPICS.has(token));

  if ((has("my") || has("mine")) && hasTopic) return true;

  const sentence = ` ${tokens.join(" ")} `;
  if (PHRASES.some((phrase) => sentence.includes(` ${phrase} `))) return true;
  if (OPENERS.some((opener) => sentence.includes(` ${opener} `)) && hasTopic) return true;

  if (tokens.some((token) => ARABIC_MINE.has(token))) return true;
  return tokens.some((token) => ARABIC_HAVE.has(token)) && tokens.some((token) => ARABIC_TOPICS.has(token));
}
