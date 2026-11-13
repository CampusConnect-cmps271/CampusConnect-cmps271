import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadStudentContext } from "@/modules/campus-assistant/student-context";
import { seedPrivateData, serviceClient, signUpStudent, stack, visitorClient, type Student } from "./support/local-stack";

/**
 * SCRUM-255: the assistant's private context must never cross from one student to
 * another. The unit tests use a fake client; this one runs against the local
 * Supabase stack with two real, signed-in students, so it is row-level security
 * itself that is under test. It skips itself when that stack is not running.
 */
describe.skipIf(!stack.reachable)("the assistant's private context across two students", () => {
  const service = serviceClient();
  let alpha: Student;
  let bravo: Student;

  beforeAll(async () => {
    alpha = await signUpStudent(service, "alpha");
    bravo = await signUpStudent(service, "bravo");
    // Alpha meets on Monday, Bravo on Thursday: each must see only their own timetable.
    await seedPrivateData(service, alpha, "ALPHA", 1);
    await seedPrivateData(service, bravo, "BRAVO", 4);
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
    const { chunks } = await loadStudentContext(visitorClient(), alpha.id);

    const text = JSON.stringify(chunks);
    expect(text).not.toContain("ALPHA-SECRET");
    expect(text).not.toContain("ALPHA-EVENT");
    expect(text).not.toContain("ALPHA-SAVED");
  });
});
