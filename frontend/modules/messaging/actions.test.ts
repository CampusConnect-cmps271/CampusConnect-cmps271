import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  rpc: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  }),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/modules/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: mocks.rpc }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/modules/logging", () => ({
  log: { info: mocks.info, warn: mocks.warn, error: mocks.error },
}));

import { startConversation } from "./actions";

const userId = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";
const conversationId = "00000000-0000-4000-8000-0000000000c1";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: userId, email: "a@mail.aub.edu", name: "A" });
  mocks.rpc.mockResolvedValue({ data: conversationId, error: null });
});

describe("startConversation", () => {
  it("opens the pair's conversation and goes to it", async () => {
    await expect(startConversation(otherId)).rejects.toThrow(
      `NEXT_REDIRECT /messages/${conversationId}`,
    );

    expect(mocks.rpc).toHaveBeenCalledWith("start_conversation", { other_user: otherId });
    expect(mocks.info).toHaveBeenCalledWith(
      "messaging.conversation.started",
      { conversationId, otherStudentId: otherId },
      { userId },
    );
  });

  it("refuses yourself and malformed ids without calling the database", async () => {
    for (const id of [userId, "not-a-student", ""]) {
      expect(await startConversation(id)).toEqual({ error: "You can't message this student." });
    }

    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each(["22023", "P0002"])("explains a rejection from the database (%s)", async (code) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code } });

    expect(await startConversation(otherId)).toEqual({ error: "You can't message this student." });
    expect(mocks.warn).toHaveBeenCalledWith(
      "messaging.conversation.rejected",
      { otherStudentId: otherId, code },
      { userId },
    );
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("reports any other failure", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "08006" } });

    expect(await startConversation(otherId)).toEqual({
      error: "We couldn't open the conversation. Please try again.",
    });
    expect(mocks.error).toHaveBeenCalledWith(
      "messaging.conversation.failure",
      { otherStudentId: otherId, code: "08006" },
      { userId },
    );
  });
});
