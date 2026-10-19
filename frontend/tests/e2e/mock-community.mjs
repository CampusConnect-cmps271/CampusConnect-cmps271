import { randomUUID } from "node:crypto";

// Test-only, in-memory stand-in for the Sprint 2 tables (posts, comments,
// upvotes, saved posts). It mimics just enough of PostgREST for the app's
// Supabase client; it is not a database and never talks to a real project.
const posts = [];
const comments = [];
const upvotes = [];
const saved = [];

const tables = {
  posts,
  post_comments: comments,
  post_upvotes: upvotes,
  saved_posts: saved,
};

const RESERVED = new Set(["select", "order", "limit", "offset"]);

async function readBody(request) {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  return raw ? JSON.parse(raw) : null;
}

// Applies PostgREST `column=eq.value` / `column=in.(a,b)` filters (anything
// else throws so unsupported queries cannot pass silently) to a list of rows.
function filterRows(rows, params, prefix = "") {
  return rows.filter((row) => {
    for (const [key, value] of params) {
      if (RESERVED.has(key)) continue;
      if (prefix ? !key.startsWith(prefix) : key.includes(".")) continue;
      const column = prefix ? key.slice(prefix.length) : key;
      if (value.startsWith("eq.")) {
        if (String(row[column]) !== value.slice(3)) return false;
      } else if (value.startsWith("gte.")) {
        if (String(row[column]) < value.slice(4)) return false;
      } else if (value.startsWith("in.(") && value.endsWith(")")) {
        const allowed = value.slice(4, -1).split(",");
        if (!allowed.includes(String(row[column]))) return false;
      } else {
        throw new Error(`mock-community: unsupported filter ${key}=${value}`);
      }
    }
    return true;
  });
}

function send(response, status, body) {
  response.statusCode = status;
  return response.end(body === undefined ? "" : JSON.stringify(body));
}

function ordered(rows, params) {
  const order = params.get("order");
  if (!order) return rows;
  const [column, direction] = order.split(".");
  const sign = direction === "desc" ? -1 : 1;
  return [...rows].sort((a, b) =>
    a[column] < b[column] ? -sign : a[column] > b[column] ? sign : 0,
  );
}

function rankedFeed(args) {
  const rows = posts
    .filter((post) => post.status === "published")
    .filter((post) => !args.p_category || post.category === args.p_category)
    .map((post) => ({
      ...post,
      upvote_count: upvotes.filter((vote) => vote.post_id === post.id).length,
    }));

  rows.sort((a, b) =>
    args.p_sort === "top" && b.upvote_count !== a.upvote_count
      ? b.upvote_count - a.upvote_count
      : b.created_at.localeCompare(a.created_at),
  );

  const size = args.p_page_size ?? 20;
  const start = ((args.p_page ?? 1) - 1) * size;
  // One extra row tells the app there is another page.
  return rows.slice(start, start + size + 1);
}

async function insert(request, response, name, rows) {
  const body = await readBody(request);
  const created = (Array.isArray(body) ? body : [body]).map((row) => ({
    id: randomUUID(),
    created_at: new Date().toISOString(),
    ...(name === "posts" ? { status: "published", edited_at: null } : {}),
    ...(name === "post_comments" ? { status: "published" } : {}),
    ...row,
  }));

  const duplicate =
    (name === "post_upvotes" || name === "saved_posts") &&
    created.some((row) =>
      rows.some(
        (existing) =>
          existing.post_id === row.post_id && existing.user_id === row.user_id,
      ),
    );

  if (duplicate) {
    return send(response, 409, {
      code: "23505",
      message: "duplicate key value violates unique constraint",
    });
  }

  rows.push(...created);

  if (!String(request.headers.prefer ?? "").includes("return=representation")) {
    return send(response, 201);
  }

  const wantsObject = String(request.headers.accept ?? "").includes(
    "vnd.pgrst.object",
  );
  return send(response, 201, wantsObject ? created[0] : created);
}

function select(request, response, name, rows, params) {
  let result = ordered(filterRows(rows, params), params);

  if (name === "saved_posts" && params.get("select")?.includes("posts")) {
    result = result
      .map((row) => ({
        created_at: row.created_at,
        posts: posts.find((post) => post.id === row.post_id),
      }))
      .filter(
        (row) =>
          row.posts &&
          filterRows([row.posts], params, "posts.").length === 1,
      );
  }

  const wantsCount = String(request.headers.prefer ?? "").includes(
    "count=exact",
  );

  if (wantsCount) response.setHeader("Content-Range", `*/${result.length}`);
  if (request.method === "HEAD") return send(response, 200);

  return send(response, 200, result);
}

// Published posts matching the request's `column=eq.value` filters, for the
// shared mock to merge with its own seeded post.
export function matchingPosts(params) {
  return filterRows(posts, params);
}

// Returns true when the request was handled here.
export async function handleCommunity(request, response, url) {
  const path = url.pathname;

  if (path === "/test/community/reset") {
    for (const rows of Object.values(tables)) rows.length = 0;
    return send(response, 200, {}), true;
  }

  if (
    path === "/rest/v1/rpc/get_ranked_feed_posts" &&
    request.method === "POST"
  ) {
    return send(response, 200, rankedFeed(await readBody(request))), true;
  }

  const match = path.match(/^\/rest\/v1\/(\w+)$/);
  const name = match?.[1];

  if (!name || !(name in tables)) return false;

  const rows = tables[name];

  if (request.method === "POST") {
    await insert(request, response, name, rows);
    return true;
  }

  if (request.method === "DELETE") {
    const doomed = new Set(filterRows(rows, url.searchParams));
    for (let i = rows.length - 1; i >= 0; i--) {
      if (doomed.has(rows[i])) rows.splice(i, 1);
    }
    return send(response, 204), true;
  }

  if (request.method === "GET" || request.method === "HEAD") {
    select(request, response, name, rows, url.searchParams);
    return true;
  }

  return false;
}
