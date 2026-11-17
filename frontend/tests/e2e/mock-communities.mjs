import { randomUUID } from "node:crypto";
import { courses } from "./mock-courses.mjs";

// Test-only, in-memory stand-in for the communities tables, views and
// functions (SCRUM-236): community_overview, community_post_feed,
// community_members, community_follows and the create, join, leave, post
// and archive functions. It mimics just enough of PostgREST, RLS and the
// migration's rules for communities.spec.ts. Each test uses its own
// students and communities, so nothing here needs resetting between tests.
export const communitiesTestAccounts = {
  "communities-amal@mail.aub.edu": "00000000-0000-4000-8000-000000000401",
  "communities-bilal@mail.aub.edu": "00000000-0000-4000-8000-000000000402",
  "communities-carla@mail.aub.edu": "00000000-0000-4000-8000-000000000403",
  "communities-dani@mail.aub.edu": "00000000-0000-4000-8000-000000000404",
  "communities-phone@mail.aub.edu": "00000000-0000-4000-8000-000000000405",
  "communities-keys@mail.aub.edu": "00000000-0000-4000-8000-000000000406",
};

// Owns the seeded communities; never signs in.
const SEED_OWNER = "00000000-0000-4000-8000-000000000407";
const TOPICS = new Set(["course", "interest", "student_life", "housing", "other"]);
const CATEGORIES = new Set(["Academics", "Campus Life", "Housing", "Clubs & Events", "General"]);

const communities = [];
const members = [];
const follows = [];
const posts = [];

function seed(name, topic, { archived = false, post = null } = {}) {
  const id = randomUUID();
  const created_at = "2026-11-01T09:00:00.000Z";
  communities.push({
    id,
    slug: slugFor(name),
    name,
    description: `A synthetic ${name.toLowerCase()} community for browser tests.`,
    topic,
    course_id: null,
    course_code: null,
    course_name: null,
    owner_id: SEED_OWNER,
    status: archived ? "archived" : "active",
    archived_at: archived ? "2026-11-05T09:00:00.000Z" : null,
    created_at,
  });
  members.push({ community_id: id, student_id: SEED_OWNER, role: "owner", joined_at: created_at });
  follows.push({ community_id: id, student_id: SEED_OWNER, followed_at: created_at });
  if (post) {
    posts.push({
      id: randomUUID(),
      community_id: id,
      author_id: SEED_OWNER,
      title: post,
      body: "Synthetic post for browser tests.",
      category: "General",
      status: "published",
      created_at: "2026-11-10T09:00:00.000Z",
      edited_at: null,
    });
  }
}

function slugFor(name) {
  let base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50).replace(/-+$/, "");
  if (base.length < 3) base = `community-${base}`.replace(/-+$/, "");
  let candidate = base;
  // "new" is the address of the page that starts a community.
  for (let suffix = 2; candidate === "new" || communities.some((community) => community.slug === candidate); suffix++) candidate = `${base}-${suffix}`;
  return candidate;
}

seed("Board games night", "interest", { post: "Catan this Friday" });
seed("Quiet study corners", "student_life", { post: "Third floor is quiet today" });
seed("Old robotics club", "student_life", { archived: true, post: "Last meetup notes" });
seed("Housing near Bliss", "housing");
seed("Photography walks", "interest");

async function readBody(request) {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

function send(response, status, body) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  return response.end(body === undefined ? "" : JSON.stringify(body));
}

const fail = (response, status, code, message) => send(response, status, { code, message, details: null, hint: null });

function wantsObject(request) {
  return String(request.headers.accept ?? "").includes("vnd.pgrst.object");
}

/** LIKE with its escapes, as a case-insensitive whole-string regex. */
function ilike(pattern, text) {
  let regex = "";
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index];
    if (char === "\\") regex += pattern[++index]?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") ?? "";
    else if (char === "%") regex += ".*";
    else if (char === "_") regex += ".";
    else regex += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${regex}$`, "isu").test(text ?? "");
}

/** Splits a PostgREST or=(...) list on commas outside quotes and parentheses. */
function orParts(value) {
  const inner = value.replace(/^\(|\)$/g, "");
  const parts = [];
  let current = "";
  let depth = 0;
  let quoted = false;
  for (let index = 0; index < inner.length; index++) {
    const char = inner[index];
    if (quoted && char === "\\") {
      current += char + inner[++index];
      continue;
    }
    if (char === '"') quoted = !quoted;
    if (!quoted && char === "(") depth++;
    if (!quoted && char === ")") depth--;
    if (!quoted && depth === 0 && char === ",") {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current) parts.push(current);
  return parts;
}

function matchesCondition(row, condition) {
  const [, column, operator, raw] = condition.match(/^([a-z_]+)\.(ilike|in|eq)\.(.*)$/) ?? [];
  if (!column) throw new Error(`mock-communities: unsupported condition ${condition}`);
  if (operator === "ilike") return ilike(raw.startsWith('"') ? JSON.parse(raw) : raw, row[column]);
  if (operator === "in") return raw.replace(/^\(|\)$/g, "").split(",").map((value) => value.replace(/^"|"$/g, "")).includes(String(row[column]));
  return String(row[column]) === raw;
}

const RESERVED = new Set(["select", "order", "limit", "offset", "or"]);

function filtered(rows, params) {
  let result = rows.filter((row) => {
    for (const [key, value] of params) {
      if (RESERVED.has(key)) continue;
      if (value.startsWith("eq.")) {
        if (String(row[key]) !== value.slice(3)) return false;
      } else if (value.startsWith("in.(")) {
        if (!value.slice(4, -1).split(",").map((item) => item.replace(/^"|"$/g, "")).includes(String(row[key]))) return false;
      } else if (value.startsWith("gte.")) {
        if (String(row[key]) < value.slice(4)) return false;
      } else {
        throw new Error(`mock-communities: unsupported filter ${key}=${value}`);
      }
    }
    return true;
  });
  const or = params.get("or");
  if (or) result = result.filter((row) => orParts(or).some((condition) => matchesCondition(row, condition)));
  const order = params.get("order");
  if (order) {
    const keys = order.split(",").map((part) => {
      const [column, direction] = part.split(".");
      return { column, sign: direction === "desc" ? -1 : 1 };
    });
    result = [...result].sort((a, b) => {
      for (const { column, sign } of keys) {
        if (a[column] < b[column]) return -sign;
        if (a[column] > b[column]) return sign;
      }
      return 0;
    });
  }
  const offset = Number(params.get("offset") ?? 0);
  const limit = params.has("limit") ? Number(params.get("limit")) : undefined;
  return result.slice(offset, limit === undefined ? undefined : offset + limit);
}

function published(communityId) {
  return posts.filter((post) => post.community_id === communityId && post.status === "published");
}

function overview(community) {
  const lastPost = published(community.id).map((post) => post.created_at).sort().at(-1) ?? null;
  return {
    ...community,
    member_count: members.filter((row) => row.community_id === community.id).length,
    follower_count: follows.filter((row) => row.community_id === community.id).length,
    last_post_at: lastPost,
    last_activity_at: lastPost && lastPost > community.created_at ? lastPost : community.created_at,
  };
}

function feedRow(post) {
  const community = communities.find((row) => row.id === post.community_id);
  return {
    community_id: post.community_id,
    community_slug: community.slug,
    community_name: community.name,
    id: post.id,
    author_id: post.author_id,
    title: post.title,
    body: post.body,
    category: post.category,
    created_at: post.created_at,
    edited_at: post.edited_at,
    upvote_count: 0,
    comment_count: 0,
  };
}

function pick(row, select) {
  if (!select || select === "*") return row;
  const picked = {};
  for (const column of select.split(",")) picked[column] = row[column];
  return picked;
}

function list(request, response, rows, params) {
  const result = filtered(rows, params).map((row) => pick(row, params.get("select")));
  if (wantsObject(request)) {
    return result.length === 1 ? send(response, 200, result[0]) : fail(response, 406, "PGRST116", "JSON object requested, multiple (or no) rows returned");
  }
  return send(response, 200, result);
}

const isMember = (communityId, studentId) => members.some((row) => row.community_id === communityId && row.student_id === studentId);

export async function handleCommunities(request, response, url, claims) {
  const path = url.pathname;
  const me = claims.sub ?? null;
  const params = url.searchParams;

  if (path === "/rest/v1/community_overview" && request.method === "GET") {
    list(request, response, communities.map(overview), params);
    return true;
  }
  if (path === "/rest/v1/community_post_feed" && request.method === "GET") {
    list(request, response, posts.filter((post) => post.status === "published").map(feedRow), params);
    return true;
  }
  if (path === "/rest/v1/community_members" && request.method === "GET") {
    list(request, response, members, params);
    return true;
  }
  if (path === "/rest/v1/community_follows" && request.method === "GET") {
    list(request, response, follows, params);
    return true;
  }
  // The restriction check's look at the student's recent communities.
  if (path === "/rest/v1/communities" && request.method === "GET") {
    send(response, 200, []);
    return true;
  }
  // "Posted in": post pages are served by the shared mock, which has no community posts.
  if (path === "/rest/v1/community_posts" && request.method === "GET") {
    send(response, 200, []);
    return true;
  }

  if (path === "/rest/v1/community_follows" && request.method === "POST") {
    const body = await readBody(request);
    const row = Array.isArray(body) ? body[0] : body;
    const community = communities.find((item) => item.id === row.community_id);
    if (!me || row.student_id !== me || !community || community.status !== "active") {
      fail(response, 403, "42501", "new row violates row-level security policy");
      return true;
    }
    if (follows.some((item) => item.community_id === row.community_id && item.student_id === me)) {
      fail(response, 409, "23505", "duplicate key value violates unique constraint");
      return true;
    }
    follows.push({ community_id: row.community_id, student_id: me, followed_at: new Date().toISOString() });
    send(response, 201);
    return true;
  }
  if (path === "/rest/v1/community_follows" && request.method === "DELETE") {
    const removed = filtered(follows, params).filter((row) => {
      const community = communities.find((item) => item.id === row.community_id);
      return row.student_id === me && community?.status === "active";
    });
    for (const row of removed) follows.splice(follows.indexOf(row), 1);
    send(response, 200, removed.map((row) => pick(row, params.get("select"))));
    return true;
  }

  if (!path.startsWith("/rest/v1/rpc/") || request.method !== "POST") return false;
  const name = path.slice("/rest/v1/rpc/".length);
  if (!["create_community", "join_community", "leave_community", "create_community_post", "archive_community"].includes(name)) return false;

  const body = await readBody(request);
  if (!me) {
    fail(response, 401, "42501", "Authentication required");
    return true;
  }

  if (name === "create_community") {
    const communityName = String(body.community_name ?? "").replace(/\s+/g, " ").trim();
    const topic = body.community_topic;
    if (communities.some((item) => item.status === "active" && item.name.toLowerCase() === communityName.toLowerCase())) {
      fail(response, 409, "23505", "A community with this name already exists");
      return true;
    }
    if (communityName.length < 3 || communityName.length > 80 || !TOPICS.has(topic) || (topic === "course") !== Boolean(body.community_course_id)) {
      fail(response, 400, "23514", "new row violates check constraint");
      return true;
    }
    const created_at = new Date().toISOString();
    const community = {
      id: randomUUID(),
      slug: slugFor(communityName),
      name: communityName,
      description: body.community_description || null,
      topic,
      course_id: body.community_course_id ?? null,
      course_code: courses.find((course) => course.id === body.community_course_id)?.code ?? null,
      course_name: courses.find((course) => course.id === body.community_course_id)?.name ?? null,
      owner_id: me,
      status: "active",
      archived_at: null,
      created_at,
    };
    communities.push(community);
    members.push({ community_id: community.id, student_id: me, role: "owner", joined_at: created_at });
    follows.push({ community_id: community.id, student_id: me, followed_at: created_at });
    const row = { id: community.id, slug: community.slug };
    send(response, 200, wantsObject(request) ? row : [row]);
    return true;
  }

  const community = communities.find((item) => item.id === body.target_community_id);
  if (!community) {
    fail(response, 404, "P0002", "Community not found");
    return true;
  }

  if (name === "archive_community") {
    if (community.owner_id !== me) {
      fail(response, 403, "42501", "Not allowed");
      return true;
    }
    if (community.status === "archived") {
      fail(response, 400, "CM010", "Community is archived");
      return true;
    }
    community.status = "archived";
    community.archived_at = new Date().toISOString();
    send(response, 204);
    return true;
  }

  if (community.status !== "active") {

    fail(response, 400, "CM010", "Community is archived");

    return true;

  }

  if (name === "join_community") {
    if (!isMember(community.id, me)) {
      const now = new Date().toISOString();
      members.push({ community_id: community.id, student_id: me, role: "member", joined_at: now });
      if (!follows.some((row) => row.community_id === community.id && row.student_id === me)) {
        follows.push({ community_id: community.id, student_id: me, followed_at: now });
      }
    }
    send(response, 204);
    return true;
  }

  if (name === "leave_community") {
    const membership = members.find((row) => row.community_id === community.id && row.student_id === me);
    if (membership?.role === "owner") {
      fail(response, 400, "CM012", "The owner cannot leave");
      return true;
    }
    if (!membership) {
      fail(response, 400, "CM011", "Not a member");
      return true;
    }
    members.splice(members.indexOf(membership), 1);
    const follow = follows.find((row) => row.community_id === community.id && row.student_id === me);
    if (follow) follows.splice(follows.indexOf(follow), 1);
    send(response, 204);
    return true;
  }

  // create_community_post
  if (!isMember(community.id, me)) {
    fail(response, 400, "CM011", "Not a member");
    return true;
  }
  if (!CATEGORIES.has(body.post_category)) {
    fail(response, 400, "22023", "Invalid category");
    return true;
  }
  const post = {
    id: randomUUID(),
    community_id: community.id,
    author_id: me,
    title: String(body.post_title).trim(),
    body: String(body.post_body).trim(),
    category: body.post_category,
    status: "published",
    created_at: new Date().toISOString(),
    edited_at: null,
  };
  posts.push(post);
  send(response, 200, post.id);
  return true;
}
