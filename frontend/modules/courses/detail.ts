import "server-only";
import { requireUser } from "@/modules/auth";
import { createClient } from "@/lib/supabase/server";
import { log } from "@/modules/logging";
import type { Course } from "./catalogue";
import { normalizeCourseCode, parsePrerequisiteReferences } from "./references";

type CourseDetail = Course & { prerequisites: string };
type CourseReference = { code: string; name: string };

export class CourseUnavailable extends Error {
  constructor() {
    super("The course information is temporarily unavailable.");
    this.name = "CourseUnavailable";
  }
}

export async function getCourseDetail(value: string) {
  // Auth interrupts must not turn into a database-error state.
  await requireUser();
  const code = normalizeCourseCode(value);
  if (!code) return null;

  try {
    const client = await createClient();
    const { data: course, error } = await client.from("courses")
      .select("id,code,name,credits,description,department,prerequisites")
      .eq("code", code).maybeSingle<CourseDetail>();
    if (error) {
      log.error("courses.detail.read_failure", { code: error.code });
      throw new CourseUnavailable();
    }
    if (!course) return null;

    const prerequisiteParts = parsePrerequisiteReferences(course.prerequisites);
    const codes = [...new Set(prerequisiteParts.flatMap((part) => part.code ? [part.code] : []))];
    const references = new Map<string, CourseReference>();
    let linksUnavailable = false;
    try {
      // Bound query URLs even for an unusually long prerequisite statement.
      for (let offset = 0; offset < codes.length; offset += 100) {
        const result = await client.from("courses").select("code,name")
          .in("code", codes.slice(offset, offset + 100));
        if (result.error) {
          log.error("courses.prerequisites.read_failure", { code: result.error.code });
          linksUnavailable = true;
          break;
        }
        for (const row of result.data ?? []) references.set(row.code, row);
      }
    } catch {
      log.error("courses.prerequisites.read_failure", { code: "connection_failure" });
      linksUnavailable = true;
    }
    if (linksUnavailable) references.clear();
    const hasUnresolvedReferences = codes.some((reference) => !references.has(reference));
    return { course, prerequisiteParts, references, linksUnavailable, hasUnresolvedReferences };
  } catch (error) {
    if (error instanceof CourseUnavailable) throw error;
    log.error("courses.detail.read_failure", { code: "connection_failure" });
    throw new CourseUnavailable();
  }
}
