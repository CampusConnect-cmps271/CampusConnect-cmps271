import "server-only";
import { z } from "zod";
import { getCurrentUser } from "@/modules/auth";
import { log } from "@/modules/logging";
import { sameOrigin } from "./http";
import { loadEvidence } from "./evidence";
import { analyzeReviews } from "./analysis";
import { boundedJson, configuredProvider } from "./provider";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export async function analysisPOST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Sign in to view review evidence." }, 401);
  if (!sameOrigin(request)) return json({ error: "Invalid request origin." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Send JSON." }, 415);
  let courseId: string;
  try { courseId = z.object({ course_id: z.uuid() }).strict().parse(await boundedJson(new Response(request.body), 1024)).course_id; }
  catch { return json({ error: "Choose a valid catalogue course." }, 400); }
  try {
    const sample = await loadEvidence(courseId);
    return json({ sample, analysis: await analyzeReviews(sample, configuredProvider()) });
  } catch {
    log.error("electives.analysis.failure", {}, { userId: user.id });
    return json({ error: "Review evidence is temporarily unavailable. Recommendations still work." }, 503);
  }
}
