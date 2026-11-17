"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/modules/auth";
import { log } from "@/modules/logging";
import { createClient } from "@/lib/supabase/server";
import { itemWindow } from "./calendar";
import { PLAN_NOT_FOUND, plannerErrorMessage } from "./errors";
import {
  plannerIdSchema,
  planSchema,
  readItemForm,
  validateItemForm,
  type ItemFieldErrors,
  type ItemFormValues,
} from "./schema";
import { readCourseSections } from "./queries";
import { chosenCrns, MAX_SECTIONS_PER_COURSE, type SectionNotice } from "./sections";
import { officialTerm } from "./terms";

/** The result of a planner button: a message for its aria-live region. */
export type PlannerActionState = { ok: boolean; message: string } | undefined;

/** An item form's result. A failed save returns what was typed. */
export type ItemActionState =
  | { ok: boolean; message: string; values?: ItemFormValues; errors?: ItemFieldErrors }
  | undefined;

const ITEM_NOT_FOUND = "That item no longer exists.";

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

/**
 * Adds a catalogue course at the end of the plan. On a plan linked to an
 * imported semester that offers the course, a single section is chosen
 * straight away; with more, the plan opens the course's section picker.
 */
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
    .select("id, semester_plans(resis_semester_id)")
    .single<{ id: string; semester_plans: { resis_semester_id: string | null } | null }>();

  if (error || !data) {
    log.warn("planner.course.add_rejected", { planId, courseId, code: error?.code ?? "no_id" }, { userId: user.id });
    return { ok: false, message: plannerErrorMessage("addCourse", error?.code) };
  }

  log.info("planner.course.added", { planId, planCourseId: data.id, courseId }, { userId: user.id });
  refreshPlan(planId);

  const semesterId = data.semester_plans?.resis_semester_id;
  const sections = semesterId ? await readCourseSections(semesterId, courseId, user.id) : null;
  if (!sections?.length) return { ok: true, message: "Added to your plan." };

  // The search result's button turns into "In this plan", so the course's card says what happened.
  if (sections.length === 1) {
    const { error: chooseError } = await supabase.rpc("planner_choose_sections", { p_plan_course_id: data.id, p_crns: [sections[0].crn] });
    if (chooseError) {
      log.warn("planner.sections.choose_rejected", { planId, planCourseId: data.id, code: chooseError.code ?? null }, { userId: user.id });
      return { ok: true, message: "Added to your plan." };
    }
    log.info("planner.sections.chosen", { planId, planCourseId: data.id, count: 1, automatic: true }, { userId: user.id });
    redirect(doneUrl(planId, data.id, "only"));
  }

  redirect(`/planner/${planId}?sections=${data.id}#course-${data.id}`);
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

/** The dates a plan's items may use, or null when the plan isn't the student's. */
async function planItemWindow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  planId: string,
): Promise<{ first: string; last: string } | null> {
  const { data } = await supabase
    .from("semester_plans")
    .select("starts_on, ends_on")
    .eq("id", planId)
    .maybeSingle<{ starts_on: string; ends_on: string }>();
  return data ? itemWindow(data) : null;
}

/** Adds something to the plan's calendar: an exam, a study session, anything. */
export async function addItem(_previous: ItemActionState, formData: FormData): Promise<ItemActionState> {
  const user = await requireUser();
  const planId = idField(formData, "planId");
  const values = readItemForm(formData);
  if (!planId) return { ok: false, message: PLAN_NOT_FOUND, values };

  const supabase = await createClient();
  const window = await planItemWindow(supabase, planId);
  if (!window) return { ok: false, message: PLAN_NOT_FOUND, values };

  const parsed = validateItemForm(values, window);
  if (!parsed.success) return { ok: false, message: "Check the item's details.", values, errors: parsed.errors };

  const { data, error } = await supabase
    .from("plan_items")
    .insert({
      plan_id: planId,
      plan_course_id: parsed.data.planCourseId,
      title: parsed.data.title,
      on_date: parsed.data.date,
      start_minute: parsed.data.start,
      end_minute: parsed.data.end,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    log.warn("planner.item.save_rejected", { planId, code: error?.code ?? "no_id" }, { userId: user.id });
    return { ok: false, message: plannerErrorMessage("saveItem", error?.code), values };
  }

  log.info("planner.item.saved", { planId, itemId: data.id }, { userId: user.id });
  refreshPlan(planId);
  return { ok: true, message: "Added to your calendar." };
}

/** Changes one of the student's items. */
export async function updateItem(_previous: ItemActionState, formData: FormData): Promise<ItemActionState> {
  const user = await requireUser();
  const planId = idField(formData, "planId");
  const itemId = idField(formData, "itemId");
  const values = readItemForm(formData);
  if (!planId || !itemId) return { ok: false, message: ITEM_NOT_FOUND, values };

  const supabase = await createClient();
  const window = await planItemWindow(supabase, planId);
  if (!window) return { ok: false, message: PLAN_NOT_FOUND, values };

  const parsed = validateItemForm(values, window);
  if (!parsed.success) return { ok: false, message: "Check the item's details.", values, errors: parsed.errors };

  const { data, error } = await supabase
    .from("plan_items")
    .update({
      plan_course_id: parsed.data.planCourseId,
      title: parsed.data.title,
      on_date: parsed.data.date,
      start_minute: parsed.data.start,
      end_minute: parsed.data.end,
    })
    .eq("id", itemId)
    .eq("plan_id", planId)
    .select("id");

  if (error) {
    log.warn("planner.item.save_rejected", { planId, itemId, code: error.code ?? null }, { userId: user.id });
    return { ok: false, message: plannerErrorMessage("saveItem", error.code), values };
  }
  if (!data?.length) return { ok: false, message: ITEM_NOT_FOUND, values };

  log.info("planner.item.saved", { planId, itemId }, { userId: user.id });
  refreshPlan(planId);
  return { ok: true, message: "Item updated." };
}

/** Removes one of the student's items. */
export async function removeItem(_previous: PlannerActionState, formData: FormData): Promise<PlannerActionState> {
  const user = await requireUser();
  const planId = idField(formData, "planId");
  const itemId = idField(formData, "itemId");
  if (!planId || !itemId) return { ok: false, message: ITEM_NOT_FOUND };

  const supabase = await createClient();
  const { data, error } = await supabase.from("plan_items").delete().eq("id", itemId).eq("plan_id", planId).select("id");

  if (error) {
    log.error("planner.item.remove_failure", { planId, itemId, code: error.code ?? null }, { userId: user.id });
    return { ok: false, message: plannerErrorMessage("removeItem", error.code) };
  }
  if (!data?.length) return { ok: false, message: ITEM_NOT_FOUND };

  log.info("planner.item.removed", { planId, itemId }, { userId: user.id });
  refreshPlan(planId);
  return { ok: true, message: "Item removed." };
}

/**
 * Links the plan to an imported semester, or clears the link when none is
 * chosen. The database allows only semesters with an active import.
 */
export async function linkSemester(_previous: PlannerActionState, formData: FormData): Promise<PlannerActionState> {
  const user = await requireUser();
  const planId = idField(formData, "planId");
  if (!planId) return { ok: false, message: PLAN_NOT_FOUND };
  const semesterId = text(formData, "semesterId");
  if (semesterId && !/^\d{6}$/.test(semesterId)) return { ok: false, message: plannerErrorMessage("linkSemester", "23503") };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("semester_plans")
    .update({ resis_semester_id: semesterId || null })
    .eq("id", planId)
    .select("id");

  if (error) {
    log.warn("planner.semester.link_rejected", { planId, semesterId: semesterId || null, code: error.code ?? null }, { userId: user.id });
    return { ok: false, message: plannerErrorMessage("linkSemester", error.code) };
  }
  if (!data?.length) return { ok: false, message: PLAN_NOT_FOUND };

  log.info("planner.semester.linked", { planId, semesterId: semesterId || null }, { userId: user.id });
  refreshPlan(planId);
  return {
    ok: true,
    message: semesterId ? "Linked. Choose sections to fill in class times." : "Unlinked. Your chosen sections stay until you change them.",
  };
}

/**
 * Back to the course's card, which says what was done. The button that did
 * it is gone once it worked (the picker closes, a notice clears), so its own
 * status line can't.
 */
function doneUrl(planId: string, planCourseId: string, what: SectionNotice): string {
  return `/planner/${planId}?done=${planCourseId}&what=${what}#course-${planCourseId}`;
}

/** Calls planner_choose_sections; the database checks every CRN against the snapshot. */
async function saveSections(planId: string, planCourseId: string, crns: string[], userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("planner_choose_sections", { p_plan_course_id: planCourseId, p_crns: crns });
  if (error) {
    log.warn("planner.sections.choose_rejected", { planId, planCourseId, count: crns.length, code: error.code ?? null }, { userId });
    return { ok: false as const, message: plannerErrorMessage("chooseSections", error.code) };
  }
  log.info("planner.sections.chosen", { planId, planCourseId, count: crns.length, meetings: Number(data) || 0 }, { userId });
  refreshPlan(planId);
  return { ok: true as const };
}

/**
 * Saves the picker's choice: a section (crn) and, for that section only, the
 * linked sections chosen under it (fields linked-<crn>-<group>). Closes the
 * picker.
 */
export async function chooseSections(_previous: PlannerActionState, formData: FormData): Promise<PlannerActionState> {
  const user = await requireUser();
  const planId = idField(formData, "planId");
  const planCourseId = idField(formData, "planCourseId");
  if (!planId || !planCourseId) return { ok: false, message: PLAN_NOT_FOUND };

  const primary = text(formData, "crn");
  if (!/^\d{1,10}$/.test(primary)) return { ok: false, message: "Choose a section." };
  const prefix = `linked-${primary}-`;
  const linked = [...formData.entries()].flatMap(([name, value]) =>
    name.startsWith(prefix) && typeof value === "string" ? [value] : [],
  );
  const crns = chosenCrns(primary, linked);
  if (crns.length === 0) return { ok: false, message: "Choose a section." };
  if (crns.length > MAX_SECTIONS_PER_COURSE) return { ok: false, message: plannerErrorMessage("chooseSections", "54000") };

  const saved = await saveSections(planId, planCourseId, crns, user.id);
  if (!saved.ok) return saved;
  redirect(doneUrl(planId, planCourseId, "picked"));
}

/** "Update times": the same sections again, from the newest snapshot. */
export async function updateSectionTimes(_previous: PlannerActionState, formData: FormData): Promise<PlannerActionState> {
  const user = await requireUser();
  const planId = idField(formData, "planId");
  const planCourseId = idField(formData, "planCourseId");
  if (!planId || !planCourseId) return { ok: false, message: PLAN_NOT_FOUND };
  const crns = chosenCrns("", text(formData, "crns").split(","));
  if (crns.length === 0 || crns.length > MAX_SECTIONS_PER_COURSE) return { ok: false, message: plannerErrorMessage("chooseSections", "22023") };

  const saved = await saveSections(planId, planCourseId, crns, user.id);
  if (!saved.ok) return saved;
  redirect(doneUrl(planId, planCourseId, "updated"));
}

/** Every plan page and the event's own page show the going mark. */
function refreshGoing(eventId: string) {
  revalidatePath("/(protected)/planner/[id]", "page");
  revalidatePath(`/events/${eventId}`);
}

/** Marks one of the student's saved events as going, so it shows on their planner calendar. */
export async function markGoing(_previous: PlannerActionState, formData: FormData): Promise<PlannerActionState> {
  const user = await requireUser();
  const eventId = idField(formData, "eventId");
  if (!eventId) return { ok: false, message: plannerErrorMessage("going", "42501") };

  const supabase = await createClient();
  const { error } = await supabase.from("going_events").insert({ event_id: eventId });

  // Already marked (23505) is what the student asked for.
  if (error && error.code !== "23505") {
    log.warn("planner.event.going_rejected", { eventId, code: error.code ?? null }, { userId: user.id });
    return { ok: false, message: plannerErrorMessage("going", error.code) };
  }

  log.info("planner.event.going", { eventId }, { userId: user.id });
  refreshGoing(eventId);
  return { ok: true, message: "Added to your planner calendar." };
}

/** Removes the going mark; the event stays saved. */
export async function unmarkGoing(_previous: PlannerActionState, formData: FormData): Promise<PlannerActionState> {
  const user = await requireUser();
  const eventId = idField(formData, "eventId");
  if (!eventId) return { ok: false, message: plannerErrorMessage("going", "42501") };

  const supabase = await createClient();
  const { error } = await supabase.from("going_events").delete().eq("event_id", eventId);

  if (error) {
    log.error("planner.event.not_going_failure", { eventId, code: error.code ?? null }, { userId: user.id });
    return { ok: false, message: plannerErrorMessage("going", error.code) };
  }

  log.info("planner.event.not_going", { eventId }, { userId: user.id });
  refreshGoing(eventId);
  return { ok: true, message: "Removed from your planner calendar." };
}
