import "server-only";
import { getCurrentUser } from "@/modules/auth";
import { getProfile } from "@/modules/profiles";
import { log } from "@/modules/logging";
import { preferencesSchema } from "./schema";
import { validateCompletedCourses, validateOfferingSemester } from "./preferences";
import { loadCandidatesForUser } from "./catalogue";
import { configuredProvider, boundedJson } from "./provider";
import { recommend } from "./recommendations";
import { recommendationTimings } from "./timings";
import type { StudentContext } from "./types";

const headers = { "Cache-Control": "private, no-store" };
export function sameOrigin(request: Request) {
  try {
    const origin = new URL(request.headers.get("origin") ?? "");
    // Next's internal request URL can use localhost behind the dev/hosting proxy.
    const host = request.headers.get("host") ?? new URL(request.url).host;
    return ["http:", "https:"].includes(origin.protocol) && origin.host === host;
  } catch { return false; }
}
export async function recommendationsPOST(request: Request) {
  const timing = recommendationTimings();
  let cache: string | undefined;
  let cacheTier: string | undefined;
  let reads: number | undefined, bytes: number | undefined;
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { ...headers, "Server-Timing": timing.header(cache, reads, bytes, cacheTier) } });
  const user = await timing.measure("auth", getCurrentUser);
  if (!user) return json({ error: "Sign in to get elective recommendations." }, 401);
  if (!sameOrigin(request)) return json({ error: "Invalid request origin." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Send JSON preferences." }, 415);
  let input: unknown;
  try { input = await boundedJson(new Response(request.body), 16384); } catch { return json({ error: "Send valid preferences within 16 KB." }, 400); }
  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) return json({ error: "Check your elective preferences." }, 400);
  try {
    if ((await timing.measure("completed_codes", () => validateCompletedCourses(parsed.data))).length) return json({ error: "Use completed course codes from the catalogue." }, 400);
    if (parsed.data.offering_preferences?.semester_id && !(await timing.measure("semester", () => validateOfferingSemester(parsed.data)))) return json({ error: "Choose a semester with imported course data." }, 400);
    const context = async (): Promise<StudentContext> => {
      try {
        const profile = await getProfile(user.id);
        const major = profile?.major?.trim() || null;
        return { major, majorStatus: major ? "known" : "missing" };
      } catch {
        log.warn("electives.recommendations.major_unavailable", {}, { userId: user.id });
        return { major: null, majorStatus: "unavailable" };
      }
    };
    const [catalogue, student] = await Promise.all([timing.measure("catalogue", () => loadCandidatesForUser(parsed.data, user)), timing.measure("profile", context)]);
    cache = catalogue.diagnostics?.cache;
    cacheTier = catalogue.diagnostics?.cacheTier;
    if (catalogue.diagnostics?.redisMs !== undefined) timing.record("redis", catalogue.diagnostics.redisMs);
    reads = catalogue.diagnostics?.dbRequests; bytes = catalogue.diagnostics?.responseBytes;
    if (catalogue.diagnostics) timing.record("catalogue_query", catalogue.diagnostics.queryMs);
    const result = await timing.measure("recommendation", () => recommend(parsed.data, catalogue, configuredProvider(), student, (stage, ms) => timing.record(stage, ms)));
    return json(result);
  } catch {
    log.error("electives.recommendations.failure", {}, { userId: user.id });
    return json({ error: "Recommendations are temporarily unavailable. Please try again." }, 503);
  }
}
