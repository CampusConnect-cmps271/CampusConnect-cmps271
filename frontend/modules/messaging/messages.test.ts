import { describe, expect, it } from "vitest";
import { mergeMessages, toMessage } from "./messages";
import type { Message } from "./types";

const conversationId = "00000000-0000-4000-8000-0000000000c1";

function message(id: string, createdAt: string, body = id): Message {
  return {
    id,
    conversationId,
    senderId: "00000000-0000-4000-8000-000000000001",
    body,
    createdAt,
  };
}

const first = message("m1", "2026-10-18T09:00:00.000001+00:00");
const second = message("m2", "2026-10-18T09:00:01+00:00");
const third = message("m3", "2026-10-18T09:00:02+00:00");

describe("mergeMessages", () => {
  it("appends a new message", () => {
    expect(mergeMessages([first, second], [third])).toEqual([first, second, third]);
  });

  it("keeps a message once when the send result and Realtime both deliver it", () => {
    const afterSend = mergeMessages([first], [second]);
    const afterRealtime = mergeMessages(afterSend, [{ ...second }]);

    expect(afterRealtime).toEqual([first, second]);
  });

  it("returns the same array when nothing is new", () => {
    const current = [first, second];
    expect(mergeMessages(current, [second, first])).toBe(current);
  });

  it("puts a message that arrives late in its place by time", () => {
    expect(mergeMessages([first, third], [second])).toEqual([first, second, third]);
  });

  it("prepends earlier messages loaded with Load earlier", () => {
    expect(mergeMessages([third], [first, second])).toEqual([first, second, third]);
  });

  it("compares times rather than text, across timestamp formats", () => {
    const zulu = message("m0", "2026-10-18T08:59:59Z");
    expect(mergeMessages([first], [zulu])).toEqual([zulu, first]);
  });

  it("orders messages sent at the same instant by id", () => {
    const sameTime = "2026-10-18T09:30:00+00:00";
    const b = message("b", sameTime);
    const a = message("a", sameTime);

    expect(mergeMessages([b], [a])).toEqual([a, b]);
  });

  it("drops duplicates inside one batch", () => {
    expect(mergeMessages([], [second, second, first])).toEqual([first, second]);
  });
});

describe("toMessage", () => {
  it("maps a database row", () => {
    expect(
      toMessage({
        id: "m1",
        conversation_id: conversationId,
        sender_id: "s1",
        body: "Hi",
        created_at: "2026-10-18T09:00:00+00:00",
      }),
    ).toEqual({
      id: "m1",
      conversationId,
      senderId: "s1",
      body: "Hi",
      createdAt: "2026-10-18T09:00:00+00:00",
    });
  });

  it("rejects anything that is not a complete row", () => {
    expect(toMessage(null)).toBeNull();
    expect(toMessage("m1")).toBeNull();
    expect(toMessage({ id: "m1", conversation_id: conversationId, sender_id: "s1" })).toBeNull();
    expect(
      toMessage({
        id: "m1",
        conversation_id: conversationId,
        sender_id: "s1",
        body: 7,
        created_at: "2026-10-18T09:00:00+00:00",
      }),
    ).toBeNull();
  });
});
