import { existsSync, readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadStudentContext } from "@/modules/campus-assistant/student-context";

/**
 * SCRUM-255: the assistant's private context must never cross from one student to
 * another. The unit tests use a fake client; this one runs against the local
 * Supabase stack with two real, signed-in students, so it is row-level security
 * itself that is under test. It skips itself when that stack is not running.
 */

function localEnv() {
  const path = new URL("../.env.local", import.meta.url);
  const file = existsSync(path) ? readFileSync(path, "utf8") : "";
  const read = (name: string) =>
    process.env[name] ?? file.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.trim().replace(/^"|"$/g, "");
  return {
    url: read("NEXT_PUBLIC_SUPABASE_URL"),
    secret: read("SUPABASE_SECRET_KEY"),
    publishable: read("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  };
}

const { url, secret, publishable } = localEnv();
const isLoopback = Boolean(url) && /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url ?? "");
const reachable =
  isLoopback && Boolean(secret) && Boolean(publishable) &&
  (await fetch(`${url}/auth/v1/health`, { signal: AbortSignal.timeout(3000) }).then(() => true, () => false));

const PASSWORD = "Test-Only-Password-1!";
const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

type Student = { id: string; client: SupabaseClient };

describe.skipIf(!reachable)("the assistant's private context across two students", () => {
  const service = createClient(url!, secret!, { auth: { persistSession: false } });
  let alpha: Student;
  let bravo: Student;

  async function signUp(name: string): Promise<Student> {
    const email = `ctx-${name}-${Date.now()}@mail.aub.edu`;
    const created = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    expect(created.error).toBeNull();
    const client = createClient(url!, publishable!, { auth: { persistSession: false } });
    expect((await client.auth.signInWithPassword({ email, password: PASSWORD })).error).toBeNull();
    return { id: created.data.user!.id, client };
  }

  /**
   * Inserts rows as `client` and fails the setup loudly if the database refuses.
   * These tables only let a student write their own rows (not even the secret key
   * may), so the seed acts as the students, exactly as the app does.
   */
  async function insert<T>(client: SupabaseClient, table: string, rows: object | object[], select = "id"): Promise<T[]> {
    const { data, error } = await client.from(table).insert(rows).select(select);
    expect(error, `${table}: ${error?.message}`).toBeNull();
    return (data ?? []) as T[];
  }

  async function seed(student: Student, label: string) {
    const as = student.client;
    // student_id is not an insertable column on plans or going marks: the database fills it from the session.
    const [plan] = await insert<{ id: string }>(as, "semester_plans", {
      term: "Fall 2035", starts_on: "2035-09-01", ends_on: "2035-12-20",
    });
    await insert(as, "plan_items", { plan_id: plan.id, title: `${label}-SECRET exam prep`, on_date: "2035-10-01" });

    // A real catalogue course with a weekly meeting, so the nested plan -> courses -> meetings read is exercised too.
    const course = await service.from("courses").select("id").eq("code", "CMPS 240").single();
    expect(course.error, `courses: ${course.error?.message}`).toBeNull();
    const [planned] = await insert<{ id: string }>(as, "plan_courses", { plan_id: plan.id, course_id: course.data!.id });
    await insert(as, "plan_meetings", {
      plan_course_id: planned.id, weekday: label === "ALPHA" ? 1 : 4, start_minute: 540, end_minute: 615, timezone: "Asia/Beirut",
    });

    // Creating an event needs an event-manager role, so the secret key makes it; saving and going are the student's.
    const [event] = await insert<{ id: string }>(service, "events", {
      organizer_id: student.id, title: `${label}-EVENT night`, description: "x", location: "Bliss Hall",
      category: "Technology", status: "published", starts_at: hoursFromNow(48), ends_at: hoursFromNow(50),
    });
    await insert(as, "saved_events", { student_id: student.id, event_id: event.id }, "event_id");
    await insert(as, "going_events", { event_id: event.id }, "event_id");

    const [saved] = await insert<{ id: string }>(as, "posts", [
      { author_id: student.id, title: `${label}-SAVED post`, body: "b", category: "Academics" },
      { author_id: student.id, title: `${label}-OWN post`, body: "b", category: "Academics" },
    ]);
    await insert(as, "saved_posts", { user_id: student.id, post_id: saved.id }, "post_id");
  }

  beforeAll(async () => {
    alpha = await signUp("alpha");
    bravo = await signUp("bravo");
    await seed(alpha, "ALPHA");
    await seed(bravo, "BRAVO");
  }, 60_000);

  afterAll(async () => {
    // Deleting a student removes their plans, saves, events and posts with them.
    for (const student of [alpha, bravo]) if (student) await service.auth.admin.deleteUser(student.id);
  }, 60_000);

  /** Everything private, as one string. The recent public feed is public by design, so it is left out. */
  const privateText = (chunks: { chunk_id: string; text: string }[]) =>
    chunks.filter((chunk) => chunk.chunk_id !== "me:feed").map((chunk) => chunk.text).join("\n");

  it("gives a student their own plan, going events, saved posts and posts", async () => {
    const { chunks, failed } = await loadStudentContext(alpha.client, alpha.id);

    expect(failed).toEqual([]);
    const text = privateText(chunks);
    expect(text).toContain("ALPHA-SECRET exam prep");
    // Alpha meets on Monday, Bravo on Thursday: each must see only their own timetable.
    expect(text).toContain("CMPS 240 Operating Systems: Mon 09:00-10:15");
    expect(text).not.toContain("Thu 09:00");
    expect(text).toMatch(/ALPHA-EVENT night.*\(going\)/);
    expect(chunks.find((chunk) => chunk.chunk_id === "me:saved-posts")?.text).toContain("ALPHA-SAVED post");
    expect(chunks.find((chunk) => chunk.chunk_id === "me:my-posts")?.text).toContain("ALPHA-OWN post");
  });

  it("never shows one student another's plan, saved events or saved posts, in either direction", async () => {
    const forAlpha = privateText((await loadStudentContext(alpha.client, alpha.id)).chunks);
    const forBravo = privateText((await loadStudentContext(bravo.client, bravo.id)).chunks);

    expect(forAlpha).not.toContain("BRAVO");
    expect(forBravo).not.toContain("ALPHA");
    expect(forBravo).toContain("BRAVO-SECRET exam prep");
    expect(forBravo).toContain("CMPS 240 Operating Systems: Thu 09:00-10:15");
    expect(forBravo).not.toContain("Mon 09:00");
  });

  it("is still safe when the caller names someone else's id: row-level security, not the filter, is the lock", async () => {
    // Alpha's session, Bravo's id: the explicit filter now asks for Bravo's rows.
    const { chunks } = await loadStudentContext(alpha.client, bravo.id);

    // What is private is Bravo's plan, which events they saved or are going to, and which posts they saved.
    const ids = chunks.map((chunk) => chunk.chunk_id);
    expect(ids.some((id) => id.startsWith("me:plan:"))).toBe(false);
    expect(ids).not.toContain("me:events");
    expect(ids).not.toContain("me:saved-posts");
    expect(JSON.stringify(chunks)).not.toContain("BRAVO-SECRET");
    expect(JSON.stringify(chunks)).not.toContain("BRAVO-EVENT");
    // Bravo's published posts are public by design (the feed shows them to every student), so a
    // "posts the student wrote" list may name them; it is the "saved" list above that must stay empty.
  });

  it("gives a signed-out visitor nothing private", async () => {
    const visitor = createClient(url!, publishable!, { auth: { persistSession: false } });
    const { chunks } = await loadStudentContext(visitor, alpha.id);

    const text = JSON.stringify(chunks);
    expect(text).not.toContain("ALPHA-SECRET");
    expect(text).not.toContain("ALPHA-EVENT");
    expect(text).not.toContain("ALPHA-SAVED");
  });
});
