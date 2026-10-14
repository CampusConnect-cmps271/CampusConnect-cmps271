import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  in: vi.fn(),
  maybeSingle: vi.fn(),
  error: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/modules/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mocks.from }) }));
vi.mock("@/modules/logging", () => ({ log: { error: mocks.error } }));

import { getDisplayNames, getProfile } from "./queries";

const studentId = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ eq: mocks.eq, in: mocks.in });
  mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle });
});

describe("getProfile", () => {
  it("maps the row to the app's shape", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        id: studentId,
        full_name: "Test Student",
        major: null,
        graduation_year: 2027,
        bio: null,
        interests: null,
        pinned_post_id: null,
      },
      error: null,
    });

    expect(await getProfile(studentId)).toEqual({
      id: studentId,
      fullName: "Test Student",
      major: null,
      graduationYear: 2027,
      bio: null,
      interests: [],
      pinnedPostId: null,
    });
    expect(mocks.select.mock.calls[0][0]).not.toContain("email");
  });

  it("returns null for an unknown or malformed id", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await getProfile(otherId)).toBeNull();

    expect(await getProfile("not-a-uuid")).toBeNull();
    expect(mocks.eq).toHaveBeenCalledTimes(1);
  });

  it("fails loudly when the database does", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { code: "PGRST205", message: "missing" } });

    await expect(getProfile("00000000-0000-4000-8000-000000000003")).rejects.toThrow("Failed to load the profile.");
    expect(mocks.error).toHaveBeenCalledWith("profiles.read.failure", {
      profileId: "00000000-0000-4000-8000-000000000003",
      code: "PGRST205",
    });
  });
});

describe("getDisplayNames", () => {
  it("looks each valid id up once and returns names keyed by id", async () => {
    mocks.in.mockResolvedValue({
      data: [
        { id: studentId, full_name: "Test Student" },
        { id: otherId, full_name: "Other Student" },
      ],
      error: null,
    });

    expect(await getDisplayNames([studentId, otherId, studentId, "bogus"])).toEqual({
      [studentId]: "Test Student",
      [otherId]: "Other Student",
    });
    expect(mocks.in).toHaveBeenCalledWith("id", [studentId, otherId]);
  });

  it("skips the query for an empty list", async () => {
    expect(await getDisplayNames([])).toEqual({});
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("returns no names instead of failing the caller's page", async () => {
    mocks.in.mockResolvedValue({ data: null, error: { code: "57014", message: "timeout" } });

    expect(await getDisplayNames([studentId])).toEqual({});
    expect(mocks.error).toHaveBeenCalledWith("profiles.display_names.read_failure", { count: 1, code: "57014" });
  });
});
