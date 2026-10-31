import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  user: vi.fn(), validate: vi.fn(), save: vi.fn(), revalidate: vi.fn(), error: vi.fn(),
}));
vi.mock("@/modules/auth", () => ({ requireUser: mocks.user }));
vi.mock("./preferences", () => ({ validateCompletedCourses: mocks.validate, saveMyPreferences: mocks.save }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/modules/logging", () => ({ log: { error: mocks.error } }));
import { updatePreferences } from "./actions";
import { preferenceValues } from "./schema";
import { electivePreferencesFixture } from "./test-fixtures";

const values = preferenceValues(electivePreferencesFixture);
function form(changes: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ ...values, ...changes })) data.set(key, value);
  return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ id: "owner" });
  mocks.validate.mockResolvedValue([]);
  mocks.save.mockResolvedValue(undefined);
});
describe("questionnaire submission", () => {
  it("saves the same validated payload used by independent recommendation tests", async () => {
    const result = await updatePreferences({ status: "idle" }, form({ student_id: "forged-owner" }));
    expect(result.status).toBe("saved");
    expect(mocks.save).toHaveBeenCalledWith(electivePreferencesFixture);
    expect(mocks.revalidate).toHaveBeenCalledWith("/electives/preferences");
  });
  it("keeps the exact draft and field errors when validation fails", async () => {
    const result = await updatePreferences({ status: "idle" }, form({ interests: "  ,  " }));
    expect(result.values).toEqual({ ...values, interests: "  ,  " });
    expect(result.errors?.interests).toBeDefined();
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("keeps unknown course codes available for correction", async () => {
    mocks.validate.mockResolvedValue(["FAKE 999"]);
    const result = await updatePreferences({ status: "idle" }, form({ completed_course_codes: "FAKE 999" }));
    expect(result.errors?.completed_course_codes).toBeDefined();
    expect(result.values?.completed_course_codes).toBe("FAKE 999");
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("retains the draft without exposing database failures", async () => {
    mocks.save.mockRejectedValue(new Error("private SQL details"));
    const result = await updatePreferences({ status: "idle" }, form());
    expect(result.status).toBe("error");
    expect(result.values).toEqual(values);
    expect(result.message).toContain("please try again");
    expect(JSON.stringify(result)).not.toContain("private SQL details");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("requires authentication before validating or saving", async () => {
    mocks.user.mockRejectedValue(new Error("redirect to login"));
    await expect(updatePreferences({ status: "idle" }, form())).rejects.toThrow("redirect");
    expect(mocks.validate).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
