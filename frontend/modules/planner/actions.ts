"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/modules/auth";
import { log } from "@/modules/logging";
import { createClient } from "@/lib/supabase/server";
import { PLAN_NOT_FOUND, plannerErrorMessage } from "./errors";
import {
  plannerIdSchema,
  planSchema,
  readMeetingForm,
  validateMeetingForm,
  type MeetingFieldErrors,
  type MeetingFormValues,
} from "./schema";
import { officialTerm } from "./terms";

/** The result of a planner button: a message for its aria-live region. */
export type PlannerActionState = { ok: boolean; message: string } | undefined;

/** A meeting form's result. A failed save returns what was typed. */
export type MeetingActionState =
  | { ok: boolean; message: string; values?: MeetingFormValues; errors?: MeetingFieldErrors }
  | undefined;

const MEETING_NOT_FOUND = "That meeting no longer exists.";

/** The new-plan form keeps the chosen term when creating fails. */
export type NewPlanState = { term: string; error: string } | undefined;

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** A UUID from a hidden field, or null. */
function idField(formData: FormData, name: string): string | null {
  const parsed = plannerIdSchema.safeParse(text(formData, name));
  return parsed.success ? parsed.data : null;
}

function refreshPlan(planId: string) {
  revalidatePath("/planner");
  revalidatePath(`/planner/${planId}`);
}

/**
 * Starts a plan for one of the official terms. The dates come from the AUB
 * academic calendar, never from the form. Opens the new plan.
 */
export async function createPlan(_previous: NewPlanState, formData: FormData): Promise<NewPlanState> {
  const user = await requireUser();
  const term = text(formData, "term");
  const parsed = planSchema.safeParse({ term });
  const official = parsed.success ? officialTerm(parsed.data.term) : undefined;

  if (!official) return { term, error: "Choose a term from the list." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("semester_plans")
    .insert({ term: official.term, starts_on: official.startsOn, ends_on: official.endsOn })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    log.warn("planner.plan.create_rejected", { code: error?.code ?? "no_id" }, { userId: user.id });
    return { term, error: plannerErrorMessage("createPlan", error?.code) };
  }

  log.info("planner.plan.created", { planId: data.id }, { userId: user.id });
  revalidatePath("/planner");
  redirect(`/planner/${data.id}`);
}

/** Deletes one of the student's plans with its courses and meetings. */
export async function deletePlan(_previous: PlannerActionState, formData: FormData): Promise<PlannerActionState> {
  const user = await requireUser();
  const planId = idField(formData, "planId");
  if (!planId) return { ok: false, message: PLAN_NOT_FOUND };

  const supabase = await createClient();
  const { data, error } = await supabase.from("semester_plans").delete().eq("id", planId).select("id");

  if (error) {
    log.error("planner.plan.delete_failure", { planId, code: error.code ?? null }, { userId: user.id });
    return { ok: false, message: plannerErrorMessage("deletePlan", error.code) };
  }
  if (!data?.length) return { ok: false, message: PLAN_NOT_FOUND };

  log.info("planner.plan.deleted", { planId }, { userId: user.id });
  revalidatePath("/planner");
  redirect("/planner");
}

/** Adds a catalogue course at the end of the plan. */
export async function addCourse(_previous: PlannerActionState, formData: FormData): Promise<PlannerActionState> {
  const user = await requireUser();
  const planId = idField(formData, "planId");
  const courseId = idField(formData, "courseId");
  if (!planId) return { ok: false, message: PLAN_NOT_FOUND };
  if (!courseId) return { ok: false, message: plannerErrorMessage("addCourse", "23503") };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plan_courses")
    .insert({ plan_id: planId, course_id: courseId })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    log.warn("planner.course.add_rejected", { planId, courseId, code: error?.code ?? "no_id" }, { userId: user.id });
    return { ok: false, message: plannerErrorMessage("addCourse", error?.code) };
  }

  log.info("planner.course.added", { planId, planCourseId: data.id, courseId }, { userId: user.id });
  refreshPlan(planId);
  return { ok: true, message: "Added to your plan." };
}

/** Removes a course, and its meetings, from the plan. */
export async function removeCourse(_previous: PlannerActionState, formData: FormData): Promise<PlannerActionState> {
  const user = await requireUser();
  const planId = idField(formData, "planId");
  const planCourseId = idField(formData, "planCourseId");
  if (!planId || !planCourseId) return { ok: false, message: PLAN_NOT_FOUND };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plan_courses")
    .delete()
    .eq("id", planCourseId)
    .eq("plan_id", planId)
    .select("id");

  if (error) {
    log.error("planner.course.remove_failure", { planId, planCourseId, code: error.code ?? null }, { userId: user.id });
    return { ok: false, message: plannerErrorMessage("removeCourse", error.code) };
  }
  if (!data?.length) return { ok: false, message: "That course is no longer in this plan." };

  log.info("planner.course.removed", { planId, planCourseId }, { userId: user.id });
  refreshPlan(planId);
  return { ok: true, message: "Removed from your plan." };
}

/** Moves a course one place up or down, through reorder_plan_courses. */
export async function moveCourse(_previous: PlannerActionState, formData: FormData): Promise<PlannerActionState> {
  const user = await requireUser();
  const planId = idField(formData, "planId");
  const planCourseId = idField(formData, "planCourseId");
  const direction = text(formData, "direction");
  if (!planId || !planCourseId) return { ok: false, message: PLAN_NOT_FOUND };
  if (direction !== "up" && direction !== "down") return { ok: false, message: "Choose Move up or Move down." };

  const supabase = await createClient();
  const { data: rows, error: readError } = await supabase
    .from("plan_courses")
    .select("id, course_id, position")
    .eq("plan_id", planId)
    .order("position", { ascending: true })
    .returns<{ id: string; course_id: string; position: number }[]>();

  if (readError) {
    log.error("planner.courses.read_failure", { planId, code: readError.code ?? null }, { userId: user.id });
    return { ok: false, message: plannerErrorMessage("moveCourse", readError.code) };
  }

  const order = rows ?? [];
  const index = order.findIndex((row) => row.id === planCourseId);
  if (index === -1) return { ok: false, message: "That course is no longer in this plan." };

  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= order.length) {
    return { ok: false, message: direction === "up" ? "It's already first." : "It's already last." };
  }

  const courseIds = order.map((row) => row.course_id);
  [courseIds[index], courseIds[target]] = [courseIds[target], courseIds[index]];

  const { error } = await supabase.rpc("reorder_plan_courses", { plan_id: planId, course_ids: courseIds });
  if (error) {
    log.warn("planner.courses.reorder_rejected", { planId, code: error.code ?? null }, { userId: user.id });
    return { ok: false, message: plannerErrorMessage("moveCourse", error.code) };
  }

  log.info("planner.courses.reordered", { planId, count: courseIds.length }, { userId: user.id });
  refreshPlan(planId);
  return { ok: true, message: direction === "up" ? "Moved up." : "Moved down." };
}

/** Adds a weekly meeting the student typed to one of their planned courses. */
export async function addMeeting(_previous: MeetingActionState, formData: FormData): Promise<MeetingActionState> {
  const user = await requireUser();
  const planId = idField(formData, "planId");
  const planCourseId = idField(formData, "planCourseId");
  const values = readMeetingForm(formData);
  if (!planId || !planCourseId) return { ok: false, message: PLAN_NOT_FOUND, values };

  const parsed = validateMeetingForm(values);
  if (!parsed.success) return { ok: false, message: "Check the meeting's day and times.", values, errors: parsed.errors };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plan_meetings")
    .insert({
      plan_course_id: planCourseId,
      weekday: parsed.data.weekday,
      start_minute: parsed.data.start,
      end_minute: parsed.data.end,
      timezone: parsed.data.timezone,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    log.warn("planner.meeting.save_rejected", { planId, planCourseId, code: error?.code ?? "no_id" }, { userId: user.id });
    return { ok: false, message: plannerErrorMessage("saveMeeting", error?.code), values };
  }

  log.info("planner.meeting.saved", { planId, planCourseId, meetingId: data.id }, { userId: user.id });
  refreshPlan(planId);
  return { ok: true, message: "Meeting added." };
}

/** Changes the day, times or zone of one of the student's meetings. */
export async function updateMeeting(_previous: MeetingActionState, formData: FormData): Promise<MeetingActionState> {
  const user = await requireUser();
  const planId = idField(formData, "planId");
  const meetingId = idField(formData, "meetingId");
  const values = readMeetingForm(formData);
  if (!planId || !meetingId) return { ok: false, message: MEETING_NOT_FOUND, values };

  const parsed = validateMeetingForm(values);
  if (!parsed.success) return { ok: false, message: "Check the meeting's day and times.", values, errors: parsed.errors };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plan_meetings")
    .update({
      weekday: parsed.data.weekday,
      start_minute: parsed.data.start,
      end_minute: parsed.data.end,
      timezone: parsed.data.timezone,
    })
    .eq("id", meetingId)
    .select("id");

  if (error) {
    log.warn("planner.meeting.save_rejected", { planId, meetingId, code: error.code ?? null }, { userId: user.id });
    return { ok: false, message: plannerErrorMessage("saveMeeting", error.code), values };
  }
  if (!data?.length) return { ok: false, message: MEETING_NOT_FOUND, values };

  log.info("planner.meeting.saved", { planId, meetingId }, { userId: user.id });
  refreshPlan(planId);
  return { ok: true, message: "Meeting updated." };
}

/** Removes one of the student's meetings. */
export async function removeMeeting(_previous: PlannerActionState, formData: FormData): Promise<PlannerActionState> {
  const user = await requireUser();
  const planId = idField(formData, "planId");
  const meetingId = idField(formData, "meetingId");
  if (!planId || !meetingId) return { ok: false, message: MEETING_NOT_FOUND };

  const supabase = await createClient();
  const { data, error } = await supabase.from("plan_meetings").delete().eq("id", meetingId).select("id");

  if (error) {
    log.error("planner.meeting.remove_failure", { planId, meetingId, code: error.code ?? null }, { userId: user.id });
    return { ok: false, message: plannerErrorMessage("removeMeeting", error.code) };
  }
  if (!data?.length) return { ok: false, message: MEETING_NOT_FOUND };

  log.info("planner.meeting.removed", { planId, meetingId }, { userId: user.id });
  refreshPlan(planId);
  return { ok: true, message: "Meeting removed." };
}
