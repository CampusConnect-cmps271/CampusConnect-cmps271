import { randomUUID } from "node:crypto";

// Test-only, in-memory stand-in for SP2-53's SkillSwap posts: the posts the
// template creates and their post_skillswap rows. It mimics just enough of
// PostgREST and RLS for the journey in skillswap.spec.ts.
const posts = [];
const swaps = [];

async function readBody(request) {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

function send(response, status, body) {
  response.statusCode = status;
  return response.end(body === undefined ? "" : JSON.stringify(body));
}

/** An ILIKE pattern as a regular expression: % any, _ one, \ escapes. */
function likeToRegex(pattern) {
  let source = "";
  for (let i = 0; i < pattern.length; i++) {
    const character = pattern[i];
    if (character === "\\" && i + 1 < pattern.length) source += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    else if (character === "%") source += ".*";
    else if (character === "_") source += ".";
    else source += character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${source}$`, "is");
}

const LABELS = { online: "Online", in_person: "In person", either: "Online or in person" };

/** SkillSwap posts matching `column=eq.value` filters, for the shared posts mock. */
export function matchingSkillSwapPosts(params) {
  return posts.filter((post) =>
    ["id", "author_id", "status"].every(
      (key) => !params.has(key) || params.get(key) === `eq.${post[key]}`,
    ),
  );
}

// Returns true when the request was handled here.
export async function handleSkillSwap(request, response, url, { userId }) {
  const path = url.pathname;
  const params = url.searchParams;

  if (path === "/test/skillswap/reset") {
    posts.length = 0;
    swaps.length = 0;
    return send(response, 200, {}), true;
  }

  if (path === "/rest/v1/rpc/create_skillswap_post" && request.method === "POST") {
    const input = await readBody(request);
    const post = {
      id: randomUUID(),
      author_id: userId,
      title: `Can teach: ${input.can_teach} · Wants to learn: ${input.wants_to_learn}`,
      body: `Can teach: ${input.can_teach}\n\nWants to learn: ${input.wants_to_learn}\n\nMeeting: ${LABELS[input.meeting_method]}`,
      category: "SkillSwap",
      status: "published",
      created_at: new Date().toISOString(),
      edited_at: null,
    };
    posts.push(post);
    swaps.push({
      post_id: post.id,
      can_teach: input.can_teach,
      wants_to_learn: input.wants_to_learn,
      meeting_method: input.meeting_method,
      availability: input.availability,
      details: input.details,
      created_at: post.created_at,
    });
    return send(response, 200, post.id), true;
  }

  if (path === "/rest/v1/post_skillswap" && request.method === "GET") {
    let rows = swaps
      .map((swap) => ({ swap, post: posts.find((post) => post.id === swap.post_id) }))
      // RLS: visible when the post is published or the reader wrote it.
      .filter(({ post }) => post.status === "published" || post.author_id === userId);

    for (const [key, value] of params) {
      if (["select", "order", "limit"].includes(key)) continue;
      const [column, operator, ...rest] = [key, ...value.split(".")];
      const operand = rest.join(".");
      rows = rows.filter(({ swap, post }) => {
        const actual = column.startsWith("posts.") ? post[column.slice(6)] : swap[column];
        if (operator === "eq") return String(actual) === operand;
        if (operator === "ilike") return likeToRegex(operand).test(String(actual));
        throw new Error(`mock-skillswap: unsupported filter ${key}=${value}`);
      });
    }

    rows.sort((a, b) => b.swap.created_at.localeCompare(a.swap.created_at));
    const limit = Number(params.get("limit") ?? 1000);
    return send(
      response,
      200,
      rows.slice(0, limit).map(({ swap, post }) => ({ ...swap, posts: { author_id: post.author_id } })),
    ), true;
  }

  return false;
}
