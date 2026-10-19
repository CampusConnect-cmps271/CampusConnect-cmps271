import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
  eq: vi.fn(),
  lt: vi.fn(),
  readMessagePage: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  }),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/modules/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: mocks.rpc, from: mocks.from }),
}));
vi.mock("./queries", () => ({ readMessagePage: mocks.readMessagePage }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/modules/logging", () => ({
  log: { info: mocks.info, warn: mocks.warn, error: mocks.error },
}));

import {
  loadEarlierMessages,
  markConversationRead,
  sendMessage,
  startConversation,
} from "./actions";

const userId = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";
const conversationId = "00000000-0000-4000-8000-0000000000c1";
const messageId = "00000000-0000-4000-8000-0000000000d1";
const createdAt = "2026-10-18T09:15:02.123456+00:00";

const savedRow = {
  id: messageId,
  conversation_id: conversationId,
  sender_id: userId,
  body: "Hello there",
  created_at: createdAt,
};

// The update builder is awaitable after its last filter.
let updateResult: { error: unknown };

beforeEach(() => {
  vi.clearAllMocks();
  updateResult = { error: null };
  mocks.requireUser.mockResolvedValue({ id: userId, email: "a@mail.aub.edu", name: "A" });
  mocks.rpc.mockResolvedValue({ data: conversationId, error: null });
  mocks.from.mockReturnValue({ insert: mocks.insert, update: mocks.update });
  mocks.insert.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ single: mocks.single });
  mocks.single.mockResolvedValue({ data: savedRow, error: null });
  const filters = {
    eq: mocks.eq,
    lt: mocks.lt,
    then: (resolve: (value: unknown) => void) => resolve(updateResult),
  };
  mocks.update.mockReturnValue(filters);
  mocks.eq.mockReturnValue(filters);
  mocks.lt.mockReturnValue(filters);
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

describe("sendMessage", () => {
  it("saves the trimmed message as the sender and logs ids only", async () => {
    expect(await sendMessage(conversationId, "  Hello there \n")).toEqual({
      message: {
        id: messageId,
        conversationId,
        senderId: userId,
        body: "Hello there",
        createdAt,
      },
    });

    expect(mocks.from).toHaveBeenCalledWith("messages");
    expect(mocks.insert).toHaveBeenCalledWith({
      conversation_id: conversationId,
      sender_id: userId,
      body: "Hello there",
    });
    expect(mocks.info).toHaveBeenCalledWith(
      "messaging.message.sent",
      { conversationId, messageId },
      { userId },
    );
    expect(JSON.stringify(mocks.info.mock.calls)).not.toContain("Hello there");
  });

  it("checks the message again on the server", async () => {
    expect(await sendMessage(conversationId, "   ")).toEqual({ error: "Write a message first." });
    expect(await sendMessage(conversationId, "x".repeat(2001))).toEqual({
      error: "Messages can be up to 2000 characters.",
    });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("refuses a malformed conversation id", async () => {
    expect(await sendMessage("../admin", "Hi")).toEqual({
      error: "You can't send messages in this conversation.",
    });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("explains an RLS refusal for someone else's conversation", async () => {
    mocks.single.mockResolvedValue({ data: null, error: { code: "42501" } });

    expect(await sendMessage(conversationId, "Let me in")).toEqual({
      error: "You can't send messages in this conversation.",
    });
    expect(mocks.warn).toHaveBeenCalledWith(
      "messaging.message.rejected",
      { conversationId, code: "42501" },
      { userId },
    );
  });

  it("reports any other failure without the message text", async () => {
    mocks.single.mockResolvedValue({ data: null, error: { code: "08006" } });

    expect(await sendMessage(conversationId, "Secret plans")).toEqual({
      error: "Your message wasn't sent. Please try again.",
    });
    expect(mocks.error).toHaveBeenCalledWith(
      "messaging.message.failure",
      { conversationId, code: "08006" },
      { userId },
    );
    expect(JSON.stringify(mocks.error.mock.calls)).not.toContain("Secret");
  });
});

describe("loadEarlierMessages", () => {
  const cursor = { createdAt, id: messageId };

  it("reads the page before the oldest message on screen", async () => {
    const page = { messages: [], hasEarlier: false };
    mocks.readMessagePage.mockResolvedValue(page);

    expect(await loadEarlierMessages(conversationId, cursor)).toBe(page);
    expect(mocks.readMessagePage).toHaveBeenCalledWith(expect.anything(), conversationId, cursor);
  });

  it("refuses a cursor that could change the filter", async () => {
    for (const before of [
      { createdAt: "2026-10-18T09:15:02Z),id.gt.(0", id: messageId },
      { createdAt, id: "x,or(id.gt.0)" },
    ]) {
      expect(await loadEarlierMessages(conversationId, before)).toEqual({
        error: "We couldn't load earlier messages. Please try again.",
      });
    }
    expect(mocks.readMessagePage).not.toHaveBeenCalled();
  });

  it("reports a failed read", async () => {
    mocks.readMessagePage.mockRejectedValue(Object.assign(new Error("boom"), { code: "57014" }));

    expect(await loadEarlierMessages(conversationId, cursor)).toEqual({
      error: "We couldn't load earlier messages. Please try again.",
    });
    expect(mocks.error).toHaveBeenCalledWith(
      "messaging.messages.read_failure",
      { conversationId, code: "57014" },
      { userId },
    );
  });
});

describe("markConversationRead", () => {
  it("moves the caller's own read marker forward only", async () => {
    expect(await markConversationRead(conversationId, createdAt)).toEqual({ ok: true });

    expect(mocks.from).toHaveBeenCalledWith("conversation_reads");
    expect(mocks.update).toHaveBeenCalledWith({ last_read_at: createdAt });
    expect(mocks.eq).toHaveBeenCalledWith("conversation_id", conversationId);
    expect(mocks.eq).toHaveBeenCalledWith("user_id", userId);
    expect(mocks.lt).toHaveBeenCalledWith("last_read_at", createdAt);
  });

  it("ignores malformed input", async () => {
    expect(await markConversationRead(conversationId, "now")).toEqual({ ok: false });
    expect(await markConversationRead("nope", createdAt)).toEqual({ ok: false });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("reports a failed update", async () => {
    updateResult = { error: { code: "08006" } };

    expect(await markConversationRead(conversationId, createdAt)).toEqual({ ok: false });
    expect(mocks.error).toHaveBeenCalledWith(
      "messaging.read_state.failure",
      { conversationId, code: "08006" },
      { userId },
    );
  });
});
