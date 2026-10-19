import type { Metadata } from "next";
import { requireUser } from "@/modules/auth";
import { CourseDetail } from "@/modules/courses/CourseDetail";
import { normalizeCourseCode } from "@/modules/courses/references";
import { parseCourseFilters, type CourseSearchParams } from "@/modules/courses/search";

type Props = { params: Promise<{ code: string }>; searchParams: Promise<CourseSearchParams> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const code = normalizeCourseCode((await params).code);
  return { title: `${code ?? "Course"} · CampusConnect` };
}

export default async function CoursePage({ params, searchParams }: Props) {
  await requireUser();
  const { code } = await params;
  const filters = parseCourseFilters(await searchParams);
  return <CourseDetail code={code} filters={filters} />;
}
