import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  rpc: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  }),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/modules/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/modules/logging", () => ({
  log: { info: mocks.info, warn: mocks.warn, error: mocks.error },
}));

import { createSkillSwapPost, updateSkillSwapPost } from "./actions";

const userId = "00000000-0000-4000-8000-000000000001";
const postId = "00000000-0000-4000-8000-0000000000a1";

function form(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) formData.set(name, value);
  return formData;
}

const filled = {
  canTeach: "Python for CMPS 200",
  wantsToLearn: "Conversational French",
  meetingMethod: "in_person",
  availability: "",
  details: "Happy to meet in Jafet.",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: userId, email: "a@mail.aub.edu", name: "A" });
  mocks.rpc.mockResolvedValue({ data: postId, error: null });
});

describe("createSkillSwapPost", () => {
  it("creates the post through the database function and opens it", async () => {
    await expect(createSkillSwapPost(undefined, form(filled))).rejects.toThrow(
      `NEXT_REDIRECT /posts/${postId}`,
    );

    expect(mocks.rpc).toHaveBeenCalledWith("create_skillswap_post", {
      can_teach: "Python for CMPS 200",
      wants_to_learn: "Conversational French",
      meeting_method: "in_person",
      availability: null,
      details: "Happy to meet in Jafet.",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/skillswap");
    expect(mocks.info).toHaveBeenCalledWith("skillswap.post.created", { postId }, { userId });
  });

  it("returns field errors and what was typed, without calling the database", async () => {
    const typed = { ...filled, canTeach: "   " };

    expect(await createSkillSwapPost(undefined, form(typed))).toEqual({
      values: typed,
      errors: { canTeach: "Tell students what you can teach." },
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("reports a failed save and keeps what was typed", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501" } });

    expect(await createSkillSwapPost(undefined, form(filled))).toEqual({
      values: filled,
      error: "We couldn't post your skill swap. Please try again.",
    });
    expect(mocks.error).toHaveBeenCalledWith(
      "skillswap.post.create_failure",
      { code: "42501" },
      { userId },
    );
  });
});

describe("updateSkillSwapPost", () => {
  it("saves through the database function and opens the post", async () => {
    await expect(updateSkillSwapPost(postId, undefined, form(filled))).rejects.toThrow(
      `NEXT_REDIRECT /posts/${postId}`,
    );

    expect(mocks.rpc).toHaveBeenCalledWith("update_skillswap_post", {
      post_id: postId,
      can_teach: "Python for CMPS 200",
      wants_to_learn: "Conversational French",
      meeting_method: "in_person",
      availability: null,
      details: "Happy to meet in Jafet.",
    });
    expect(mocks.info).toHaveBeenCalledWith("skillswap.post.updated", { postId }, { userId });
  });

  it("explains when the post is not the student's to edit", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "P0002" } });

    expect(await updateSkillSwapPost(postId, undefined, form(filled))).toEqual({
      values: filled,
      error: "This skill swap can't be edited. It may have been deleted.",
    });
  });

  it("refuses a malformed post id without calling the database", async () => {
    expect((await updateSkillSwapPost("../admin", undefined, form(filled)))?.error).toBe(
      "This skill swap can't be edited. It may have been deleted.",
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
