import { existsSync, readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect } from "vitest";

/**
 * Helpers for tests that need the real local Supabase stack (real row-level
 * security, real signed-in students). `stack.reachable` is false when the stack
 * is not running, and those tests skip themselves.
 */

function localEnv() {
  const path = new URL("../../.env.local", import.meta.url);
  const file = existsSync(path) ? readFileSync(path, "utf8") : "";
  const read = (name: string) =>
    process.env[name] ?? file.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.trim().replace(/^"|"$/g, "");
  return {
    url: read("NEXT_PUBLIC_SUPABASE_URL") ?? "",
    secret: read("SUPABASE_SECRET_KEY") ?? "",
    publishable: read("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ?? "",
  };
}

const env = localEnv();
const isLoopback = /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(env.url);

export const stack = {
  ...env,
  reachable:
    isLoopback && Boolean(env.secret) && Boolean(env.publishable) &&
    (await fetch(`${env.url}/auth/v1/health`, { signal: AbortSignal.timeout(3000) }).then(() => true, () => false)),
};

const PASSWORD = "Test-Only-Password-1!";

export type Student = { id: string; client: SupabaseClient };

/** A client that uses the secret key. Note that most student tables grant nothing to it by design. */
export function serviceClient(): SupabaseClient {
  return createClient(stack.url, stack.secret, { auth: { persistSession: false } });
}

/** A signed-out client, as a visitor would have. */
export function visitorClient(): SupabaseClient {
  return createClient(stack.url, stack.publishable, { auth: { persistSession: false } });
}

/** Creates a confirmed student and returns a client signed in as them. */
export async function signUpStudent(service: SupabaseClient, name: string): Promise<Student> {
  const email = `ctx-${name}-${Date.now()}@mail.aub.edu`;
  const created = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  expect(created.error).toBeNull();
  const client = visitorClient();
  expect((await client.auth.signInWithPassword({ email, password: PASSWORD })).error).toBeNull();
  return { id: created.data.user!.id, client };
}

/**
 * Inserts rows as `client` and fails the setup loudly if the database refuses.
 * Most student tables only let a student write their own rows (not even the
 * secret key may), so seeds act as the students, exactly as the app does.
 */
export async function insertAs<T>(client: SupabaseClient, table: string, rows: object | object[], select = "id"): Promise<T[]> {
  const { data, error } = await client.from(table).insert(rows).select(select);
  expect(error, `${table}: ${error?.message}`).toBeNull();
  return (data ?? []) as T[];
}

export const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

/**
 * Gives a student private data whose text starts with `label` (ALPHA, BRAVO), so a
 * test can tell whose it is: a plan with a catalogue course and a dated item, a
 * saved event they are going to, a saved post and a post of their own. Returns
 * the ids a test may want.
 */
export async function seedPrivateData(service: SupabaseClient, student: Student, label: string, meetingWeekday: number) {
  const as = student.client;
  // student_id is not an insertable column on plans or going marks: the database fills it from the session.
  const [plan] = await insertAs<{ id: string }>(as, "semester_plans", { term: "Fall 2035", starts_on: "2035-09-01", ends_on: "2035-12-20" });
  await insertAs(as, "plan_items", { plan_id: plan.id, title: `${label}-SECRET exam prep`, on_date: "2035-10-01" });

  // A real catalogue course with a weekly meeting, so the nested plan -> courses -> meetings read is exercised too.
  const course = await service.from("courses").select("id").eq("code", "CMPS 240").single();
  expect(course.error, `courses: ${course.error?.message}`).toBeNull();
  const [planned] = await insertAs<{ id: string }>(as, "plan_courses", { plan_id: plan.id, course_id: course.data!.id });
  await insertAs(as, "plan_meetings", {
    plan_course_id: planned.id, weekday: meetingWeekday, start_minute: 540, end_minute: 615, timezone: "Asia/Beirut",
  });

  // Creating an event needs an event-manager role, so the secret key makes it; saving and going are the student's.
  const [event] = await insertAs<{ id: string }>(service, "events", {
    organizer_id: student.id, title: `${label}-EVENT night`, description: "x", location: "Bliss Hall",
    category: "Technology", status: "published", starts_at: hoursFromNow(48), ends_at: hoursFromNow(50),
  });
  await insertAs(as, "saved_events", { student_id: student.id, event_id: event.id }, "event_id");
  await insertAs(as, "going_events", { event_id: event.id }, "event_id");

  const [saved] = await insertAs<{ id: string }>(as, "posts", [
    { author_id: student.id, title: `${label}-SAVED post`, body: "b", category: "Academics" },
    { author_id: student.id, title: `${label}-OWN post`, body: "b", category: "Academics" },
  ]);
  await insertAs(as, "saved_posts", { user_id: student.id, post_id: saved.id }, "post_id");
  return { planId: plan.id, eventId: event.id };
}
