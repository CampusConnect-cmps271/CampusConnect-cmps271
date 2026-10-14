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

import { pinPost, unpinPost } from "./pin-actions";

const userId = "00000000-0000-4000-8000-000000000001";
const postId = "00000000-0000-4000-8000-0000000000aa";

// The query builder: every filter returns the builder; it is awaitable for
// unpin and ends in maybeSingle() for pin.
let unpinResult: { error: unknown };

beforeEach(() => {
  vi.clearAllMocks();
  unpinResult = { error: null };
  mocks.requireUser.mockResolvedValue({ id: userId, email: "student@mail.aub.edu", name: "Test Student" });
  const builder = {
    eq: mocks.eq,
    select: mocks.select,
    maybeSingle: mocks.maybeSingle,
    then: (resolve: (value: unknown) => void) => resolve(unpinResult),
  };
  mocks.from.mockReturnValue({ update: mocks.update });
  mocks.update.mockReturnValue(builder);
  mocks.eq.mockReturnValue(builder);
  mocks.select.mockReturnValue(builder);
  mocks.maybeSingle.mockResolvedValue({ data: { pinned_post_id: postId }, error: null });
});

describe("pinPost", () => {
  it("pins the post on the caller's own profile", async () => {
    expect(await pinPost(postId)).toEqual({ pinned: true });

    expect(mocks.from).toHaveBeenCalledWith("profiles");
    expect(mocks.update).toHaveBeenCalledWith({ pinned_post_id: postId });
    expect(mocks.eq).toHaveBeenCalledWith("id", userId);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/profile");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/posts/${postId}`);
    expect(mocks.info).toHaveBeenCalledWith("profiles.pin.success", { postId }, { userId });
  });

  it("rejects a malformed id without touching the database", async () => {
    expect(await pinPost("../../profile")).toEqual({ error: "You can only pin your own published posts." });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("explains the database refusing someone else's or an unpublished post", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: null,
      error: { code: "23514", message: "Only a published post you wrote can be pinned" },
    });

    expect(await pinPost(postId)).toEqual({ error: "You can only pin your own published posts." });
    expect(mocks.warn).toHaveBeenCalledWith("profiles.pin.rejected", { postId, code: "23514" }, { userId });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("reports other failures as a retryable error", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { code: "57014", message: "timeout" } });

    expect(await pinPost(postId)).toEqual({ error: "We couldn't update your pinned post. Please try again." });
    expect(mocks.error).toHaveBeenCalledWith("profiles.pin.failure", { postId, code: "57014" }, { userId });
  });
});

describe("unpinPost", () => {
  it("clears the pin only while it is still this post", async () => {
    expect(await unpinPost(postId)).toEqual({ pinned: false });

    expect(mocks.update).toHaveBeenCalledWith({ pinned_post_id: null });
    expect(mocks.eq).toHaveBeenCalledWith("id", userId);
    expect(mocks.eq).toHaveBeenCalledWith("pinned_post_id", postId);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/profile");
  });

  it("reports a failed unpin", async () => {
    unpinResult = { error: { code: "57014", message: "timeout" } };

    expect(await unpinPost(postId)).toEqual({ error: "We couldn't update your pinned post. Please try again." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("does nothing for a malformed id", async () => {
    expect(await unpinPost("nope")).toEqual({ pinned: false });
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
