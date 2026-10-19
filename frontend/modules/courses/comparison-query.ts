import "server-only";
import { z } from "zod";
import { requireUser } from "@/modules/auth";
import { createClient } from "@/lib/supabase/server";
import { log } from "@/modules/logging";
import { getCourseRatings } from "@/modules/ratings/queries";
import { parseComparisonSelection } from "./codes";

const courseSchema = z.object({
  id: z.uuid(), code: z.string(), name: z.string(), department: z.string(), prerequisites: z.string(),
  credits: z.union([z.number(), z.string().regex(/^\d+(?:\.\d+)?$/).transform(Number)]).pipe(z.number().min(0).max(999.99)),
});

export class ComparisonUnavailable extends Error {
  constructor() { super("The course comparison is temporarily unavailable."); this.name = "ComparisonUnavailable"; }
}

export async function getCourseComparison(values: string[]) {
  await requireUser();
  const { codes, error: selectionError } = parseComparisonSelection(values);
  if (selectionError || codes.length < 2) throw new Error("Choose two or three different courses.");
  let rows: z.infer<typeof courseSchema>[];
  try {
    const client = await createClient();
    const { data, error } = await client.from("courses")
      .select("id,code,name,credits,department,prerequisites").in("code", codes);
    if (error) {
      log.error("courses.comparison.read_failure", { code: error.code });
      throw new ComparisonUnavailable();
    }
    const parsed = z.array(courseSchema).safeParse(data);
    if (!parsed.success || parsed.data.some((row) => !codes.includes(row.code))
      || new Set(parsed.data.map((row) => row.code)).size !== parsed.data.length) {
      log.error("courses.comparison.read_failure", { code: "invalid_data" });
      throw new ComparisonUnavailable();
    }
    rows = parsed.data;
  } catch (error) {
    if (error instanceof ComparisonUnavailable) throw error;
    log.error("courses.comparison.read_failure", { code: "connection_failure" });
    throw new ComparisonUnavailable();
  }
  const byCode = new Map(rows.map((row) => [row.code, row]));
  const courses = codes.flatMap((code) => byCode.get(code) ?? []);
  const missing = codes.filter((code) => !byCode.has(code));
  const ratings = await getCourseRatings(courses.map((course) => course.id));
  return { courses, missing, ratings };
}
