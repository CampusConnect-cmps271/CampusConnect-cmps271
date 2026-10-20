import { randomUUID } from "node:crypto";

// Test-only, in-memory stand-in for the SP2-40 notifications table and the
// SP2-41 message trigger. RLS is mimicked by limiting every request to the
// caller's own rows; Realtime is not modelled.
const notifications = [];

async function readBody(request) {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

function send(response, status, body) {
  response.statusCode = status;
  return response.end(body === undefined ? "" : JSON.stringify(body));
}

/** Drops the notifications of these students (all of them when none given). */
export function resetNotifications(userIds = null) {
  for (let i = notifications.length - 1; i >= 0; i--) {
    const row = notifications[i];
    if (!userIds || userIds.includes(row.recipient_id) || userIds.includes(row.actor_id)) {
      notifications.splice(i, 1);
    }
  }
}

/** Like the message trigger: one unread notification per conversation. */
export function notifyMessage(recipientId, actorId, conversationId, createdAt) {
  const unread = notifications.find(
    (row) =>
      row.recipient_id === recipientId &&
      row.conversation_id === conversationId &&
      row.type === "message" &&
      row.read_at === null,
  );

  if (unread) {
    unread.actor_id = actorId;
    unread.created_at = createdAt;
    return;
  }

  notifications.push({
    id: randomUUID(),
    recipient_id: recipientId,
    type: "message",
    actor_id: actorId,
    conversation_id: conversationId,
    post_id: null,
    comment_id: null,
    created_at: createdAt,
    read_at: null,
  });
}

/** Like reading a conversation: its message notification is cleared. */
export function readMessageNotifications(userId, conversationId, upTo) {
  for (const row of notifications) {
    if (
      row.recipient_id === userId &&
      row.conversation_id === conversationId &&
      row.type === "message" &&
      row.read_at === null &&
      row.created_at <= upTo
    ) {
      row.read_at = new Date().toISOString();
    }
  }
}

function matches(row, params, userId) {
  if (row.recipient_id !== userId) return false;
  for (const [key, value] of params) {
    if (["select", "order", "limit", "offset"].includes(key)) continue;
    if (value === "is.null") {
      if (row[key] !== null) return false;
    } else if (value.startsWith("eq.")) {
      if (String(row[key]) !== value.slice(3)) return false;
    } else {
      throw new Error(`mock-notifications: unsupported filter ${key}=${value}`);
    }
  }
  return true;
}

// Returns true when the request was handled here.
export async function handleNotifications(request, response, url, { userId }) {
  if (url.pathname !== "/rest/v1/notifications") return false;
  const params = url.searchParams;

  if (request.method === "GET" || request.method === "HEAD") {
    const rows = notifications
      .filter((row) => matches(row, params, userId))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, Number(params.get("limit") ?? 1000));

    if (String(request.headers.prefer ?? "").includes("count=exact")) {
      response.setHeader("Content-Range", `*/${rows.length}`);
    }
    if (request.method === "HEAD") return send(response, 200), true;
    return send(response, 200, rows), true;
  }

  if (request.method === "PATCH") {
    const { read_at: readAt } = await readBody(request);
    for (const row of notifications) {
      if (matches(row, params, userId)) row.read_at = readAt;
    }
    return send(response, 204), true;
  }

  return false;
}
