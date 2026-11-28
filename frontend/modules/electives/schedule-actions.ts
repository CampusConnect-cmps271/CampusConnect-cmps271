"use server";
import { redirect } from "next/navigation";
import { requireUser } from "@/modules/auth";
import { addCourse, type PlannerActionState } from "@/modules/planner/actions";
import { getMyPlan } from "@/modules/planner/queries";
import { plannerIdSchema } from "@/modules/planner/schema";
import { getScheduleCourse } from "./schedule";

/** The existing planner owns section selection, saved times and conflict checks. */
export async function addElectiveToSchedule(_previous: PlannerActionState, form: FormData): Promise<PlannerActionState> {
  const user = await requireUser();
  const text = (name: string) => typeof form.get(name) === "string" ? form.get(name) as string : "";
  const courseId = text("courseId"), semesterId = text("semesterId"), planId = text("planId");
  if (!plannerIdSchema.safeParse(planId).success) return {ok:false,message:"Choose one of your semester plans."};
  let plan;
  try {
    const course = await getScheduleCourse(courseId, semesterId);
    if (!course) return {ok:false,message:"This course is no longer available in the selected semester."};
    plan = await getMyPlan(planId);
  } catch {
    return {ok:false,message:"Your course or plan could not be loaded. Please try again."};
  }
  if (!plan || plan.student_id !== user.id || plan.semester?.id !== semesterId) {
    return {ok:false,message:"Choose a plan linked to the same semester as this elective."};
  }
  if (plan.course_ids.includes(courseId)) redirect(`/planner/${planId}#calendar`);
  const input = new FormData(); input.set("planId", planId); input.set("courseId", courseId);
  // addCourse redirects to the existing section picker when multiple sections
  // exist, or chooses the only section. Do not catch Next's redirect here.
  const state = await addCourse(undefined, input);
  if (state?.ok) redirect(`/planner/${planId}#calendar`);
  return state;
}
