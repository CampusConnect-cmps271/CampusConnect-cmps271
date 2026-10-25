import { z } from "zod";

export const QUESTION_MIN_LENGTH = 3;
export const QUESTION_MAX_LENGTH = 500;
/** Most evidence sent to the provider: page chunks, then catalogue courses. */
export const MAX_PAGE_EVIDENCE = 5;
export const MAX_COURSE_EVIDENCE = 3;

/** A page of this app's own course catalogue, e.g. /courses/CMPS-271. */
const COURSE_PATH = /^\/courses\/[A-Za-z0-9%_-]+$/;

/**
 * True only for the two places a citation may point: an https page on
 * aub.edu.lb, or a course page of this app.
 */
export function isCitableUrl(value: string): boolean {
  if (COURSE_PATH.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && /(^|\.)aub\.edu\.lb$/.test(url.hostname);
  } catch {
    return false;
  }
}

/** Earlier turns sent with a follow-up so "and how long does it take?" can be understood. */
export const HISTORY_MAX_TURNS = 3;
export const HISTORY_ANSWER_MAX_LENGTH = 600;

const questionText = z.string().trim().min(QUESTION_MIN_LENGTH).max(QUESTION_MAX_LENGTH);

export const questionSchema = z.object({
  question: questionText,
  history: z
    .array(z.object({ question: questionText, answer: z.string().trim().max(HISTORY_ANSWER_MAX_LENGTH) }))
    .max(HISTORY_MAX_TURNS)
    .default([]),
});

/** One earlier question and the answer shown for it. Context only, never evidence. */
export type HistoryTurn = z.infer<typeof questionSchema>["history"][number];

/** A stored chunk of an official AUB page, or a catalogue course, retrieved for one question. */
export type EvidenceChunk = {
  chunk_id: string;
  source_id: string;
  url: string;
  title: string;
  /** When the page was fetched; null for catalogue courses, which are live data. */
  retrieved_at: string | null;
  text: string;
};

/**
 * What the provider is asked to return. It names chunks by id and never
 * writes a URL or title, so a citation can only point at retrieved evidence.
 */
export const providerAnswerSchema = z.object({
  answer: z.string().trim().max(4000),
  citation_chunk_ids: z.array(z.string().max(80)).max(20),
  insufficient_evidence: z.boolean(),
});

export type Citation = {
  source_id: string;
  chunk_id: string;
  url: string;
  title: string;
  retrieved_at: string | null;
};

export type AssistantAnswer = {
  answer: string;
  citations: Citation[];
  insufficient_evidence: boolean;
};
