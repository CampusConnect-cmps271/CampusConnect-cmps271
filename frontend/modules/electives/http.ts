import "server-only";
import { getCurrentUser } from "@/modules/auth";
import { getMyProfile } from "@/modules/profiles";
import { log } from "@/modules/logging";
import { preferencesSchema } from "./schema";
import { validateCompletedCourses } from "./preferences";
import { loadCandidates } from "./catalogue";
import { configuredProvider, boundedJson } from "./provider";
import { recommend } from "./recommendations";
import type { StudentContext } from "./types";

const headers = { "Cache-Control": "private, no-store" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
export function sameOrigin(request: Request) {
  try {
    const origin = new URL(request.headers.get("origin") ?? "");
    // Next's internal request URL can use localhost behind the dev/hosting proxy.
    const host = request.headers.get("host") ?? new URL(request.url).host;
    return ["http:", "https:"].includes(origin.protocol) && origin.host === host;
  } catch { return false; }
}
export async function recommendationsPOST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Sign in to get elective recommendations." }, 401);
  if (!sameOrigin(request)) return json({ error: "Invalid request origin." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Send JSON preferences." }, 415);
  let input: unknown;
  try { input = await boundedJson(new Response(request.body), 16384); } catch { return json({ error: "Send valid preferences within 16 KB." }, 400); }
  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) return json({ error: "Check your elective preferences." }, 400);
  try {
    if ((await validateCompletedCourses(parsed.data)).length) return json({ error: "Use completed course codes from the catalogue." }, 400);
    const context = async (): Promise<StudentContext> => {
      try {
        const profile = await getMyProfile();
        const major = profile?.major?.trim() || null;
        return { major, majorStatus: major ? "known" : "missing" };
      } catch {
        log.warn("electives.recommendations.major_unavailable", {}, { userId: user.id });
        return { major: null, majorStatus: "unavailable" };
      }
    };
    const [catalogue, student] = await Promise.all([loadCandidates(), context()]);
    return json(await recommend(parsed.data, catalogue, configuredProvider(), student));
  } catch {
    log.error("electives.recommendations.failure", {}, { userId: user.id });
    return json({ error: "Recommendations are temporarily unavailable. Please try again." }, 503);
  }
}
