import "server-only";
import { getCurrentUser } from "@/modules/auth";
import { log } from "@/modules/logging";
import { preferencesSchema } from "./schema";
import { validateCompletedCourses } from "./preferences";
import { loadCandidates } from "./catalogue";
import { configuredProvider, boundedJson } from "./provider";
import { recommend } from "./recommendations";

const headers = { "Cache-Control": "private, no-store" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
export async function recommendationsPOST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Sign in to get elective recommendations." }, 401);
  if (request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "Invalid request origin." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Send JSON preferences." }, 415);
  let input: unknown;
  try { input = await boundedJson(new Response(request.body), 16384); } catch { return json({ error: "Send valid preferences within 16 KB." }, 400); }
  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) return json({ error: "Check your elective preferences." }, 400);
  try {
    if ((await validateCompletedCourses(parsed.data)).length) return json({ error: "Use completed course codes from the catalogue." }, 400);
    return json(await recommend(parsed.data, await loadCandidates(), configuredProvider()));
  } catch {
    log.error("electives.recommendations.failure", {}, { userId: user.id });
    return json({ error: "Recommendations are temporarily unavailable. Please try again." }, 503);
  }
}
