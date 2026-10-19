import { randomUUID } from "node:crypto";

// Test-only, in-memory stand-in for the SP2-36 messaging tables and
// functions. It mimics just enough of PostgREST, and of the RLS rules, for
// the app's Supabase client; Realtime is not modelled (no WebSocket).
const conversations = [];
const reads = [];
const messages = [];

async function readBody(request) {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

function send(response, status, body) {
  response.statusCode = status;
  return response.end(body === undefined ? "" : JSON.stringify(body));
}

const eq = (params, column) => params.get(column)?.replace(/^eq\./, "");
const isParticipant = (conversation, userId) =>
  conversation.student_a === userId || conversation.student_b === userId;
const participantOf = (conversationId, userId) =>
  conversations.find((row) => row.id === conversationId && isParticipant(row, userId));

function unreadFor(conversationId, userId) {
  const read = reads.find(
    (row) => row.conversation_id === conversationId && row.user_id === userId,
  );
  return messages.some(
    (message) =>
      message.conversation_id === conversationId &&
      message.sender_id !== userId &&
      message.created_at > (read?.last_read_at ?? ""),
  );
}

// Returns true when the request was handled here. `userId` is the caller's
// verified id; `profileName(id)` is the profile's name, or null when none.
export async function handleMessaging(request, response, url, { userId, profileName }) {
  const path = url.pathname;
  const params = url.searchParams;

  if (path === "/test/messaging/reset") {
    conversations.length = 0;
    reads.length = 0;
    messages.length = 0;
    return send(response, 200, {}), true;
  }

  if (path === "/rest/v1/rpc/start_conversation" && request.method === "POST") {
    const { other_user: other } = await readBody(request);
    if (!userId) return send(response, 401, { code: "42501", message: "Sign in" }), true;
    if (other === userId) return send(response, 400, { code: "22023", message: "Yourself" }), true;
    if (!profileName(other)) return send(response, 400, { code: "P0002", message: "No student" }), true;

    const [a, b] = [userId, other].sort();
    let conversation = conversations.find((row) => row.student_a === a && row.student_b === b);
    if (!conversation) {
      const now = new Date().toISOString();
      conversation = { id: randomUUID(), student_a: a, student_b: b, created_at: now, last_message_at: null };
      conversations.push(conversation);
      reads.push(
        { conversation_id: conversation.id, user_id: a, last_read_at: now },
        { conversation_id: conversation.id, user_id: b, last_read_at: now },
      );
    }
    return send(response, 200, conversation.id), true;
  }

  if (path === "/rest/v1/rpc/list_my_conversations" && request.method === "POST") {
    const rows = conversations
      .filter((row) => isParticipant(row, userId) && row.last_message_at)
      .sort((x, y) => y.last_message_at.localeCompare(x.last_message_at))
      .map((row) => {
        const otherId = row.student_a === userId ? row.student_b : row.student_a;
        const last = messages.filter((m) => m.conversation_id === row.id).at(-1);
        return {
          conversation_id: row.id,
          other_user_id: otherId,
          other_user_name: profileName(otherId),
          last_message_preview: last.body.replace(/\s+/g, " ").trim().slice(0, 100),
          last_message_at: row.last_message_at,
          unread: unreadFor(row.id, userId),
        };
      });
    return send(response, 200, rows), true;
  }

  if (path === "/rest/v1/rpc/count_my_unread_conversations" && request.method === "POST") {
    const count = conversations.filter(
      (row) => isParticipant(row, userId) && unreadFor(row.id, userId),
    ).length;
    return send(response, 200, count), true;
  }

  if (path === "/rest/v1/conversations" && request.method === "GET") {
    const rows = conversations.filter(
      (row) => row.id === eq(params, "id") && isParticipant(row, userId),
    );
    return send(response, 200, rows), true;
  }

  if (path === "/rest/v1/conversation_reads" && request.method === "GET") {
    const rows = reads
      .filter(
        (row) =>
          row.conversation_id === eq(params, "conversation_id") &&
          row.user_id === eq(params, "user_id") &&
          row.user_id === userId,
      )
      .map(({ last_read_at }) => ({ last_read_at }));
    return send(response, 200, rows), true;
  }

  if (path === "/rest/v1/conversation_reads" && request.method === "PATCH") {
    const { last_read_at: readAt } = await readBody(request);
    const notBefore = params.get("last_read_at")?.replace(/^lt\./, "");
    for (const row of reads) {
      if (
        row.conversation_id === eq(params, "conversation_id") &&
        row.user_id === eq(params, "user_id") &&
        row.user_id === userId &&
        (!notBefore || row.last_read_at < notBefore)
      ) {
        row.last_read_at = readAt;
      }
    }
    return send(response, 204), true;
  }

  if (path === "/rest/v1/messages" && request.method === "GET") {
    const conversationId = eq(params, "conversation_id");
    const limit = Number(params.get("limit") ?? 1000);
    const rows = participantOf(conversationId, userId)
      ? messages.filter((m) => m.conversation_id === conversationId).slice().reverse().slice(0, limit)
      : [];
    return send(response, 200, rows), true;
  }

  if (path === "/rest/v1/messages" && request.method === "POST") {
    const row = await readBody(request);
    if (row.sender_id !== userId || !participantOf(row.conversation_id, userId)) {
      return send(response, 403, { code: "42501", message: "new row violates row-level security policy" }), true;
    }
    if (!/\S/.test(row.body ?? "") || row.body.length > 2000) {
      return send(response, 400, { code: "23514", message: "messages_body_length" }), true;
    }

    const saved = {
      id: randomUUID(),
      conversation_id: row.conversation_id,
      sender_id: userId,
      body: row.body,
      created_at: new Date().toISOString(),
    };
    messages.push(saved);
    conversations.find((c) => c.id === saved.conversation_id).last_message_at = saved.created_at;

    const wantsObject = String(request.headers.accept ?? "").includes("vnd.pgrst.object");
    return send(response, 201, wantsObject ? saved : [saved]), true;
  }

  return false;
}
