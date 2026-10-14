import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  from: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  maybeSingle: vi.fn(),
  revalidatePath: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/modules/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mocks.from }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/modules/logging", () => ({ log: { info: mocks.info, warn: mocks.warn, error: mocks.error } }));

import { updateMyProfile } from "./actions";

const userId = "00000000-0000-4000-8000-000000000001";

function submission(fields: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const validFields = {
  fullName: " Test   Student ",
  major: "Computer Science",
  graduationYear: "2027",
  bio: "Hello there",
  interests: "Chess, Python",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: userId, email: "student@mail.aub.edu", name: "Test Student" });
  // from("profiles").update(...).eq(...).select(...).maybeSingle()
  mocks.from.mockReturnValue({ update: mocks.update });
  mocks.update.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ maybeSingle: mocks.maybeSingle });
  mocks.maybeSingle.mockResolvedValue({ data: { id: userId }, error: null });
});

describe("updateMyProfile", () => {
  it("saves the caller's own row with normalised values", async () => {
    expect(await updateMyProfile(undefined, submission(validFields))).toEqual({ status: "saved" });

    expect(mocks.from).toHaveBeenCalledWith("profiles");
    expect(mocks.update).toHaveBeenCalledWith({
      full_name: "Test Student",
      major: "Computer Science",
      graduation_year: 2027,
      bio: "Hello there",
      interests: ["Chess", "Python"],
    });
    expect(mocks.eq).toHaveBeenCalledWith("id", userId);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/profile");
    expect(mocks.info).toHaveBeenCalledWith("profiles.update.success", {}, { userId });
  });

  it("ignores any id the form tries to send", async () => {
    await updateMyProfile(undefined, submission({ ...validFields, id: "00000000-0000-4000-8000-000000000009" }));

    expect(mocks.eq).toHaveBeenCalledWith("id", userId);
    expect(mocks.update.mock.calls[0][0]).not.toHaveProperty("id");
  });

  it("returns field errors and the typed values without touching the database", async () => {
    const fields = { ...validFields, fullName: "", graduationYear: "1999" };
    const state = await updateMyProfile(undefined, submission(fields));

    expect(state).toEqual({
      status: "error",
      errors: {
        fullName: ["Full name is required"],
        graduationYear: ["Enter a year between 2020 and 2035"],
      },
      values: fields,
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("reports a failed save and logs only the error code", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { code: "23514", message: "violates check constraint" } });

    const state = await updateMyProfile(undefined, submission(validFields));

    expect(state).toMatchObject({
      status: "error",
      message: "We couldn't save your profile. Please try again.",
      values: validFields,
    });
    expect(mocks.error).toHaveBeenCalledWith("profiles.update.failure", { code: "23514" }, { userId });
    expect(JSON.stringify(mocks.error.mock.calls)).not.toContain("Hello there");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("treats a missing profile row as a failed save", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });

    expect(await updateMyProfile(undefined, submission(validFields))).toMatchObject({ status: "error" });
    expect(mocks.error).toHaveBeenCalledWith("profiles.update.failure", { code: "no_profile_row" }, { userId });
  });

  it("does nothing for a signed-out caller", async () => {
    mocks.requireUser.mockRejectedValue(new Error("REDIRECT:/login?next=%2Fprofile"));

    await expect(updateMyProfile(undefined, submission(validFields))).rejects.toThrow("REDIRECT:/login");
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
