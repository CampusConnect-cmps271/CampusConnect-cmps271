import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/modules/auth";
import {
  answerQuestion,
  createRateLimiter,
  getConfiguredProvider,
  ProviderError,
  QUESTION_MAX_LENGTH,
  questionSchema,
  retrieveEvidence,
} from "@/modules/campus-assistant";
import { log } from "@/modules/logging";

/**
 * Authenticated question answering for the campus assistant (SP3-41).
 *
 * The provider key is read here, on the server, and never reaches the browser.
 * Logs carry the question's length and the outcome, never its text.
 */

/** A question, plus up to three earlier turns of at most 1,100 characters each, with room for Arabic and JSON framing. */
const MAX_BODY_BYTES = 16 * 1024;
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const checkRate = createRateLimiter(RATE_LIMIT, RATE_WINDOW_MS);

export async function POST(request: NextRequest): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "UNAUTHENTICATED", "Sign in first.");

  // Browsers label cross-site requests; refuse those, as /api/log does.
  const site = request.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin" && site !== "none") {
    return apiError(403, "FORBIDDEN", "This request is not allowed.");
  }

  const retryAfter = checkRate(user.id);
  if (retryAfter > 0) {
    log.warn("campus_assistant.rate_limited", {}, { userId: user.id });
    const response = apiError(429, "RATE_LIMITED", "Too many questions. Please wait a moment and try again.");
    response.headers.set("Retry-After", String(retryAfter));
    return response;
  }

  // The declared length is checked first so an oversized body is not read at all.
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return apiError(413, "TOO_LARGE", "The question is too long.");
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return apiError(413, "TOO_LARGE", "The question is too long.");

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return apiError(400, "INVALID_JSON", "Request body must be a JSON object.");
  }
  const parsed = questionSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_FAILED", `Ask a question of 3 to ${QUESTION_MAX_LENGTH} characters.`);
  }
  const { question, history } = parsed.data;

  try {
    const provider = getConfiguredProvider();
    const supabase = await createClient();
    const result = await answerQuestion(question, (text) => retrieveEvidence(supabase, text), provider, history);

    log.info(
      "campus_assistant.answered",
      { question_length: question.length, citations: result.citations.length, insufficient: result.insufficient_evidence },
      { userId: user.id },
    );
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const kind = error instanceof ProviderError ? error.kind : "retrieval_failed";
    log.error("campus_assistant.failed", { kind, question_length: question.length }, { userId: user.id });

    if (kind === "timeout") return apiError(504, "ASSISTANT_TIMEOUT", "The assistant took too long. Please try again.");
    return apiError(503, "ASSISTANT_UNAVAILABLE", "The assistant is unavailable right now. Please try again later.");
  }
}
