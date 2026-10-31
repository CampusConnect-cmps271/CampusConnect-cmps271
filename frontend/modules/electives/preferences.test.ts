import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), read: vi.fn(), codes: vi.fn(), upsert: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/auth", () => ({ requireUser: mocks.user }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mocks.from }) }));
import { getMyPreferences, saveMyPreferences } from "./preferences";
import { electivePreferencesFixture as preferences } from "./test-fixtures";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ id: "owner" });
  mocks.read.mockResolvedValue({ data: preferences, error: null });
  mocks.codes.mockResolvedValue({ data: [{ code: "CMPS 101" }], error: null });
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.eq.mockReturnValue({ maybeSingle: mocks.read });
  mocks.select.mockReturnValue({ eq: mocks.eq, in: mocks.codes });
  mocks.from.mockReturnValue({ select: mocks.select, upsert: mocks.upsert });
});
it("scopes saved-state reads to the authenticated owner", async () => {
  expect(await getMyPreferences()).toEqual(preferences);
  expect(mocks.eq).toHaveBeenCalledWith("student_id", "owner");
  mocks.user.mockResolvedValue({ id: "other" });
  await getMyPreferences();
  expect(mocks.eq).toHaveBeenLastCalledWith("student_id", "other");
});
it("represents a new student with no saved preferences", async () => {
  mocks.read.mockResolvedValue({ data: null, error: null });
  expect(await getMyPreferences()).toBeNull();
});
it("normalizes known course codes and upserts under the authenticated owner", async () => {
  await saveMyPreferences({ ...preferences, completed_course_codes: [" cmps   101 ", "CMPS 101"] });
  expect(mocks.codes).toHaveBeenCalledWith("code", ["CMPS 101"]);
  expect(mocks.upsert).toHaveBeenCalledWith({ ...preferences, student_id: "owner" }, { onConflict: "student_id" });
});
it("rejects unknown codes without writing", async () => {
  mocks.codes.mockResolvedValue({ data: [], error: null });
  await expect(saveMyPreferences({ ...preferences, completed_course_codes: ["FAKE 999"] })).rejects.toThrow("catalogue");
  expect(mocks.upsert).not.toHaveBeenCalled();
});
it("rejects a forged owner rather than passing it to the database", async () => {
  await expect(saveMyPreferences({ ...preferences, student_id: "other" })).rejects.toThrow();
  expect(mocks.from).not.toHaveBeenCalled();
});
it("requires authentication before reading or writing", async () => {
  mocks.user.mockRejectedValue(new Error("redirect to login"));
  await expect(getMyPreferences()).rejects.toThrow("redirect");
  await expect(saveMyPreferences(preferences)).rejects.toThrow("redirect");
  expect(mocks.from).not.toHaveBeenCalled();
});
it("hides read, catalogue and write failure details", async () => {
  const error = { message: "private SQL and infrastructure details" };
  mocks.read.mockResolvedValue({ data: null, error });
  await expect(getMyPreferences()).rejects.toMatchObject({ message: expect.not.stringContaining("private") });
  mocks.codes.mockResolvedValue({ data: null, error });
  await expect(saveMyPreferences(preferences)).rejects.toMatchObject({ message: expect.not.stringContaining("private") });
  expect(mocks.upsert).not.toHaveBeenCalled();
  mocks.codes.mockResolvedValue({ data: [{ code: "CMPS 101" }], error: null });
  mocks.upsert.mockResolvedValue({ error });
  await expect(saveMyPreferences(preferences)).rejects.toMatchObject({ message: expect.not.stringContaining("private") });
});
