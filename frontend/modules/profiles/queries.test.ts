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

import { getDisplayNames, getPinnedPost, getProfile } from "./queries";

const studentId = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ eq: mocks.eq, in: mocks.in });
  mocks.eq.mockReturnValue({ eq: mocks.eq, maybeSingle: mocks.maybeSingle });
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

describe("getPinnedPost", () => {
  const postId = "00000000-0000-4000-8000-0000000000aa";
  const profile = {
    id: studentId,
    fullName: "Test Student",
    major: null,
    graduationYear: null,
    bio: null,
    interests: [],
    pinnedPostId: postId,
  };

  it("loads the pinned post only while it is the owner's and published", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        id: postId,
        title: "Exam tips",
        body: "Start early.\n\nSleep well.",
        category: "Academics",
        created_at: "2026-10-12T09:00:00Z",
      },
      error: null,
    });

    expect(await getPinnedPost(profile)).toEqual({
      id: postId,
      title: "Exam tips",
      category: "Academics",
      excerpt: "Start early. Sleep well.",
      createdAt: "2026-10-12T09:00:00Z",
    });
    expect(mocks.from).toHaveBeenCalledWith("posts");
    expect(mocks.eq).toHaveBeenCalledWith("id", postId);
    expect(mocks.eq).toHaveBeenCalledWith("author_id", studentId);
    expect(mocks.eq).toHaveBeenCalledWith("status", "published");
  });

  it("skips the query when nothing is pinned", async () => {
    expect(await getPinnedPost({ ...profile, pinnedPostId: null })).toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("shows no pin rather than failing the profile", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { code: "57014", message: "timeout" } });

    expect(await getPinnedPost(profile)).toBeNull();
    expect(mocks.error).toHaveBeenCalledWith("profiles.pinned_post.read_failure", {
      profileId: studentId,
      postId,
      code: "57014",
    });
  });
});
