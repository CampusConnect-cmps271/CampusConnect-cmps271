import "server-only";

import { createClient } from "@/lib/supabase/server";

export type RestrictedContentType = "post" | "comment" | "review";

export type ContentRestrictionInput = {
  userId: string;
  contentType: RestrictedContentType;
  body: string;
  title?: string;
  /** Set for edits so the current row is not treated as a duplicate. */
  excludeId?: string;
};

export type RestrictionRule =
  | "blocked_language"
  | "too_many_links"
  | "duplicate_content"
  | "posting_too_quickly"
  | "check_unavailable";

export type ContentRestrictionResult =
  | { allowed: true }
  | { allowed: false; rule: RestrictionRule; message: string };

type RecentEntry = {
  id: string;
  title?: string | null;
  body: string;
};

const RESTRICTION_MESSAGES: Record<RestrictionRule, string> = {
  blocked_language:
    "This content violates the community language guidelines. Please revise it.",
  too_many_links:
    "This content contains too many links. Remove some links and try again.",
  duplicate_content:
    "You already submitted identical content. Please avoid duplicate submissions.",
  posting_too_quickly:
    "You are posting too quickly. Wait a moment and try again.",
  check_unavailable:
    "Content checks are temporarily unavailable. Please try again.",
};

// This list is intentionally kept in a server-only module. The client receives
// only the rule category and never the terms used by the check.
const BLOCKED_ENGLISH_TERMS = [
  "idiot",
  "moron",
  "stupid",
  "kill yourself",
] as const;

const BLOCKED_ARABIC_TERMS = [
  "احمق",
  "أحمق",
  "غبي",
  "اقتل نفسك",
] as const;

const LINK_PATTERN = /(?:https?:\/\/|www\.)[^\s]+/giu;
const MAX_LINKS = 3;
const POST_WINDOW_MS = 5 * 60 * 1000;
const COMMENT_WINDOW_MS = 60 * 1000;
const MAX_POSTS_PER_WINDOW = 3;
const MAX_COMMENTS_PER_WINDOW = 5;

function normalizeArabic(value: string) {
  return value
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/gu, "")
    .replace(/[إأآٱ]/gu, "ا")
    .replace(/ى/gu, "ي")
    .replace(/ة/gu, "ه")
    .replace(/ـ/gu, "");
}

export function normalizeRestrictedContent(value: string) {
  return normalizeArabic(value.normalize("NFKC").toLocaleLowerCase("en"))
    .replace(/\s+/gu, " ")
    .trim();
}

function containsBlockedEnglishTerm(content: string) {
  return BLOCKED_ENGLISH_TERMS.some((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[^\\p{L}])${escaped}(?:$|[^\\p{L}])`, "iu").test(
      content,
    );
  });
}

function containsBlockedArabicTerm(content: string) {
  const normalized = normalizeArabic(content);
  return BLOCKED_ARABIC_TERMS.some((term) =>
    normalized.includes(normalizeArabic(term)),
  );
}

function blocked(rule: RestrictionRule): ContentRestrictionResult {
  return { allowed: false, rule, message: RESTRICTION_MESSAGES[rule] };
}

/**
 * Pure rule evaluator, exported for focused unit tests. Application code should
 * call checkContentRestrictions so duplicate and frequency checks are included.
 */
export function evaluateContentRestrictions(
  input: Pick<ContentRestrictionInput, "contentType" | "title" | "body" | "excludeId">,
  recentEntries: RecentEntry[],
): ContentRestrictionResult {
  const combined = normalizeRestrictedContent(
    [input.title ?? "", input.body].filter(Boolean).join("\n"),
  );

  if (
    containsBlockedEnglishTerm(combined) ||
    containsBlockedArabicTerm(combined)
  ) {
    return blocked("blocked_language");
  }

  if ((combined.match(LINK_PATTERN) ?? []).length > MAX_LINKS) {
    return blocked("too_many_links");
  }

  const duplicate = recentEntries.some((entry) => {
    if (entry.id === input.excludeId) return false;
    const previous = normalizeRestrictedContent(
      [entry.title ?? "", entry.body].filter(Boolean).join("\n"),
    );
    return previous === combined;
  });

  if (duplicate) return blocked("duplicate_content");

  if (!input.excludeId) {
    const limit =
      input.contentType === "post"
        ? MAX_POSTS_PER_WINDOW
        : MAX_COMMENTS_PER_WINDOW;
    if (recentEntries.length >= limit) return blocked("posting_too_quickly");
  }

  return { allowed: true };
}

/**
 * Canonical server-side community restriction check.
 *
 * Inputs: verified user id, content type, body, optional post title, and the
 * current row id for edits. Post, comment and review Server Actions call this before
 * saving so the rule list never ships to the browser.
 */
export async function checkContentRestrictions(
  input: ContentRestrictionInput,
): Promise<ContentRestrictionResult> {
  const supabase = await createClient();
  const windowMs =
    input.contentType === "post" ? POST_WINDOW_MS : COMMENT_WINDOW_MS;
  const since = new Date(Date.now() - windowMs).toISOString();

  if (input.contentType === "review") {
    const { data, error } = await supabase
      .from("course_reviews")
      .select("id, body")
      .eq("student_id", input.userId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(MAX_COMMENTS_PER_WINDOW + 10);
    if (error) return blocked("check_unavailable");
    return evaluateContentRestrictions(input, (data ?? []) as RecentEntry[]);
  }
  if (input.contentType === "post") {
    const { data, error } = await supabase
      .from("posts")
      .select("id, title, body")
      .eq("author_id", input.userId)
      .eq("status", "published")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(MAX_POSTS_PER_WINDOW + 10);

    if (error) return blocked("check_unavailable");
    return evaluateContentRestrictions(input, (data ?? []) as RecentEntry[]);
  }

  const { data, error } = await supabase
    .from("post_comments")
    .select("id, body")
    .eq("author_id", input.userId)
    .eq("status", "published")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(MAX_COMMENTS_PER_WINDOW + 10);

  if (error) return blocked("check_unavailable");
  return evaluateContentRestrictions(input, (data ?? []) as RecentEntry[]);
}

