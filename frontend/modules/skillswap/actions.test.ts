import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  rpc: vi.fn(),
  /** skillswap_post_text, read with .single(). */
  postText: vi.fn(),
  /** create_skillswap_post and update_skillswap_post. */
  save: vi.fn(),
  restrictions: vi.fn(),
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
vi.mock("@/modules/moderation/restrictions", () => ({ checkContentRestrictions: mocks.restrictions }));
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

const textArguments = {
  can_teach: "Python for CMPS 200",
  wants_to_learn: "Conversational French",
  meeting_method: "in_person",
  availability: null,
  details: "Happy to meet in Jafet.",
};

// What skillswap_post_text returns for `filled`.
const generated = {
  title: "Can teach: Python for CMPS 200 · Wants to learn: Conversational French",
  body: "Can teach: Python for CMPS 200\n\nWants to learn: Conversational French\n\nMeeting: In person\n\nHappy to meet in Jafet.",
};

const blockedLanguage = {
  allowed: false,
  rule: "blocked_language",
  message: "This content violates the community language guidelines. Please revise it.",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: userId, email: "a@mail.aub.edu", name: "A" });
  mocks.rpc.mockImplementation((name: string) =>
    name === "skillswap_post_text" ? { single: mocks.postText } : mocks.save(),
  );
  mocks.postText.mockResolvedValue({ data: generated, error: null });
  mocks.save.mockResolvedValue({ data: postId, error: null });
  mocks.restrictions.mockResolvedValue({ allowed: true });
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

  it("runs the post restrictions on the text the database will write", async () => {
    await expect(createSkillSwapPost(undefined, form(filled))).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.rpc).toHaveBeenCalledWith("skillswap_post_text", textArguments);
    expect(mocks.restrictions).toHaveBeenCalledWith({
      userId,
      contentType: "post",
      title: generated.title,
      body: generated.body,
      excludeId: undefined,
    });
  });

  it("refuses restricted content without creating the post and keeps what was typed", async () => {
    mocks.restrictions.mockResolvedValue(blockedLanguage);

    expect(await createSkillSwapPost(undefined, form(filled))).toEqual({
      values: filled,
      error: blockedLanguage.message,
    });
    expect(mocks.rpc).not.toHaveBeenCalledWith("create_skillswap_post", expect.anything());
    expect(mocks.warn).toHaveBeenCalledWith(
      "skillswap.post.restricted",
      { rule: "blocked_language" },
      { userId },
    );
  });

  it("does not create the post when the text for the check can't be built", async () => {
    mocks.postText.mockResolvedValue({ data: null, error: { code: "PGRST301" } });

    expect(await createSkillSwapPost(undefined, form(filled))).toEqual({
      values: filled,
      error: "Content checks are temporarily unavailable. Please try again.",
    });
    expect(mocks.restrictions).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalledWith("create_skillswap_post", expect.anything());
  });

  it("reports a failed save and keeps what was typed", async () => {
    mocks.save.mockResolvedValue({ data: null, error: { code: "42501" } });

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

  it("checks the edit without counting the post against itself", async () => {
    await expect(updateSkillSwapPost(postId, undefined, form(filled))).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.restrictions).toHaveBeenCalledWith({
      userId,
      contentType: "post",
      title: generated.title,
      body: generated.body,
      excludeId: postId,
    });
  });

  it("refuses a restricted edit without saving it", async () => {
    mocks.restrictions.mockResolvedValue(blockedLanguage);

    expect(await updateSkillSwapPost(postId, undefined, form(filled))).toEqual({
      values: filled,
      error: blockedLanguage.message,
    });
    expect(mocks.rpc).not.toHaveBeenCalledWith("update_skillswap_post", expect.anything());
  });

  it("explains when the post is not the student's to edit", async () => {
    mocks.save.mockResolvedValue({ data: null, error: { code: "P0002" } });

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
