import { createServer } from "node:http";
import { handleCommunity, matchingPosts } from "./mock-community.mjs";
import { handleMessaging } from "./mock-messaging.mjs";
import { handleNotifications } from "./mock-notifications.mjs";
import { handleSkillSwap, matchingSkillSwapPosts } from "./mock-skillswap.mjs";
import { handleCourses } from "./mock-courses.mjs";
import { handleReviews } from "./mock-reviews.mjs";
import { handleRatings } from "./mock-ratings.mjs";
import { handlePostSearch, postSearchFixtures } from "./mock-post-search.mjs";
import { clubTestAccounts, handleClubs } from "./mock-clubs.mjs";
import { handlePlanner, plannerTestAccounts } from "./mock-planner.mjs";

const user = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "student@mail.aub.edu",
  email_confirmed_at: "2026-10-05T12:00:00Z",
  aud: "authenticated",
  role: "authenticated",
};
// SP2-60: accounts of their own for the profile tests, so profile edits never
// leak into the login and verification fixtures that share student@'s id.
const profileAccounts = {
  "profile-editor@mail.aub.edu": "00000000-0000-4000-8000-000000000003",
  "profile-viewer@mail.aub.edu": "00000000-0000-4000-8000-000000000005",
  // SP2-36..39: three students for the messaging tests.
  "messaging-maya@mail.aub.edu": "00000000-0000-4000-8000-000000000006",
  "messaging-omar@mail.aub.edu": "00000000-0000-4000-8000-000000000007",
  "messaging-rami@mail.aub.edu": "00000000-0000-4000-8000-000000000008",
  // SP2-40..42: three students for the notification tests.
  "notify-lina@mail.aub.edu": "00000000-0000-4000-8000-000000000009",
  "notify-karim@mail.aub.edu": "00000000-0000-4000-8000-00000000000a",
  "notify-nadia@mail.aub.edu": "00000000-0000-4000-8000-00000000000b",
  // SP2-46/52: isolated students for course-review and reporting tests.
  "reviews-journey@mail.aub.edu": "00000000-0000-4000-8000-000000000106",
  "reviews-validation@mail.aub.edu": "00000000-0000-4000-8000-000000000107",
  "reviews-owner@mail.aub.edu": "00000000-0000-4000-8000-000000000108",
  "reviews-other@mail.aub.edu": "00000000-0000-4000-8000-000000000109",
  "reviews-duplicate@mail.aub.edu": "00000000-0000-4000-8000-000000000110",
  "reviews-stale@mail.aub.edu": "00000000-0000-4000-8000-000000000111",
  "reviews-pending@mail.aub.edu": "00000000-0000-4000-8000-000000000112",
  "reviews-network@mail.aub.edu": "00000000-0000-4000-8000-000000000113",
  "reviews-report-owner@mail.aub.edu": "00000000-0000-4000-8000-000000000114",
  "reviews-reporter@mail.aub.edu": "00000000-0000-4000-8000-000000000115",
  // SCRUM-172/173: the rating summary and review hydration tests.
  "ratings-editor@mail.aub.edu": "00000000-0000-4000-8000-000000000116",
  "reviews-hydration@mail.aub.edu": "00000000-0000-4000-8000-000000000117",
  // SP2-53..55: two students for the SkillSwap journey.
  "skillswap-sami@mail.aub.edu": "00000000-0000-4000-8000-00000000000c",
  "skillswap-dana@mail.aub.edu": "00000000-0000-4000-8000-00000000000d",
  "clubs-representative@mail.aub.edu": clubTestAccounts.REP_ID,
  "clubs-admin@mail.aub.edu": clubTestAccounts.ADMIN_ID,
  ...plannerTestAccounts,
};
// Another student whose public profile the tests visit.
const otherStudentId = "00000000-0000-4000-8000-000000000004";
// SP2-11: the post that student has pinned.
const pinnedPost = {
  id: "00000000-0000-4000-8000-0000000000a1", author_id: otherStudentId, status: "published",
  title: "Study group tonight", body: "Library, third floor, 7pm. Bring past exams.",
  category: "Academics", created_at: "2026-10-12T09:00:00Z",
};
const profiles = new Map([[otherStudentId, {
  id: otherStudentId, full_name: "Other Student", major: "Biology", graduation_year: 2026,
  bio: "Pre-med and coffee enthusiast.", interests: ["Biology", "Running"], pinned_post_id: pinnedPost.id,
}]]);
for (const [id, fullName] of [
  ["00000000-0000-4000-8000-000000000006", "Maya Saleh"],
  ["00000000-0000-4000-8000-000000000007", "Omar Fares"],
  ["00000000-0000-4000-8000-000000000008", "Rami Nassar"],
  ["00000000-0000-4000-8000-000000000009", "Lina Haddad"],
  ["00000000-0000-4000-8000-00000000000a", "Karim Aoun"],
  ["00000000-0000-4000-8000-00000000000b", "Nadia Khalil"],
  ["00000000-0000-4000-8000-00000000000c", "Sami Haddad"],
  ["00000000-0000-4000-8000-00000000000d", "Dana Rizk"],
]) {
  profiles.set(id, { id, full_name: fullName, major: null, graduation_year: null, bio: null, interests: [], pinned_post_id: null });
}
let roleLookups = 0;
let resends = 0;
// Test-only state, isolated by email so parallel recovery cases cannot affect
// each other or the existing login/verification fixtures. Never real users.
const recoveryAccounts = new Map();

function authFailure(response, status, code) {
  response.statusCode = status;
  return response.end(JSON.stringify({ code, msg: "Test-only Auth rejection" }));
}

function bearerEmail(request) {
  const token = request.headers.authorization?.slice(7);
  if (!token) return null;
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).email;
  } catch {
    return null;
  }
}

function bearerClaims(request) {
  const token = request.headers.authorization?.slice(7);
  if (!token) return {};
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
  } catch {
    return {};
  }
}

// Like the sign-up trigger: a profile starts with the email's local part.
// Unsaved defaults follow the caller's email, since several fixtures share an id.
function profileFor(id, claims) {
  if (profiles.has(id)) return profiles.get(id);
  if (id !== claims.sub) return null;
  return { id, full_name: (claims.email ?? user.email).split("@")[0], major: null, graduation_year: null, bio: null, interests: [], pinned_post_id: null };
}

function requestedIds(url) {
  const filter = url.searchParams.get("id") ?? "";
  if (filter.startsWith("eq.")) return [filter.slice(3)];
  if (filter.startsWith("in.(")) return filter.slice(4, -1).split(",").map((id) => id.replaceAll('"', ""));
  return [];
}

function sessionFor(email, confirmed) {
  const id = confirmed ? (profileAccounts[email] ?? user.id) : "00000000-0000-4000-8000-000000000002";
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const access_token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: id, aud: "authenticated", role: "authenticated", email, exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`;
  return { access_token, refresh_token: "test-refresh-token", expires_in: 3600, token_type: "bearer", user: { ...user, id, email, email_confirmed_at: confirmed ? user.email_confirmed_at : null } };
}

createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1:3101");
  const path = url.pathname;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("x-supabase-api-version", "2024-01-01");
  if (path === "/health") return response.end("{}");
  if (path === "/test/role-lookups") return response.end(JSON.stringify({ roleLookups }));
  if (path === "/test/resends") return response.end(JSON.stringify({ resends }));
  if (path === "/test/recovery") {
    const account = recoveryAccounts.get(url.searchParams.get("email"));
    const { requests = 0, verifications = 0, updates = 0, revocations = 0 } = account ?? {};
    // Only counts are observable; no passwords or session tokens are exposed.
    return response.end(JSON.stringify({ requests, verifications, updates, revocations }));
  }
  if (path === "/auth/v1/recover" && request.method === "POST") {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const { email } = JSON.parse(raw);
    if (email.startsWith("recovery-limit@")) return authFailure(response, 429, "over_email_send_rate_limit");
    if (email.startsWith("recovery-unavailable@")) return authFailure(response, 500, "unexpected_failure");
    if (email.startsWith("recovery-unknown@")) return response.end("{}");
    const account = recoveryAccounts.get(email) ?? { password: "test-verified-password", requests: 0, verifications: 0, updates: 0, revocations: 0 };
    account.requests++;
    account.used = false;
    recoveryAccounts.set(email, account);
    return response.end("{}");
  }
  if (path === "/auth/v1/verify" && request.method === "POST") {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const { email, token, type } = JSON.parse(raw);
    const account = recoveryAccounts.get(email);
    if (account) account.verifications++;
    if (type !== "recovery" || !account || account.used) return authFailure(response, 403, "otp_expired");
    if (token === "33333333") return authFailure(response, 429, "over_request_rate_limit");
    if (token === "44444444") return authFailure(response, 500, "unexpected_failure");
    if (token !== "01234567") return authFailure(response, 403, "otp_expired");
    account.used = true;
    return response.end(JSON.stringify(sessionFor(email, true)));
  }
  if (path === "/auth/v1/user" && request.method === "PUT") {
    const account = recoveryAccounts.get(bearerEmail(request));
    if (!account?.used) return authFailure(response, 401, "session_not_found");
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const { password } = JSON.parse(raw);
    if (password === account.password) return authFailure(response, 422, "same_password");
    if (password === "LeakedPass#2026") return authFailure(response, 422, "weak_password");
    account.password = password;
    account.updates++;
    return response.end(JSON.stringify({ ...user, email: bearerEmail(request) }));
  }
  if (path === "/auth/v1/token" && request.method === "POST") {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const { email, password } = JSON.parse(raw);
    const recovered = recoveryAccounts.get(email);
    if (recovered) {
      if (password === recovered.password) return response.end(JSON.stringify(sessionFor(email, true)));
      return authFailure(response, 400, "invalid_credentials");
    }
    if (password === "test-unverified-password") {
      response.statusCode = 400;
      return response.end(JSON.stringify({ code: "email_not_confirmed", msg: "Email not confirmed" }));
    }
    if (password === "test-verified-password" || password === "test-unexpected-unverified-session") {
      return response.end(JSON.stringify(sessionFor(email, password === "test-verified-password")));
    }
    response.statusCode = password === "test-rate-limit" ? 429 : 400;
    return response.end(JSON.stringify({ code: password === "test-rate-limit" ? "over_request_rate_limit" : "invalid_credentials", msg: "Test-only Auth rejection" }));
  }
  if (path === "/auth/v1/logout") {
    const account = recoveryAccounts.get(bearerEmail(request));
    if (account && url.searchParams.get("scope") === "global") account.revocations++;
    return response.end("{}");
  }
  if (path === "/auth/v1/resend") { resends++; return response.end("{}"); }
  if (path === "/auth/v1/user" && request.headers.authorization?.startsWith("Bearer ")) {
    const token = request.headers.authorization.slice(7);
    const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    if (claims.sub === "00000000-0000-4000-8000-000000000002") {
      return response.end(JSON.stringify({ ...user, id: claims.sub, email: claims.email, email_confirmed_at: null, user_metadata: { email_verified: true } }));
    }
    return response.end(JSON.stringify({ ...user, id: claims.sub ?? user.id, email: claims.email ?? user.email }));
  }
  if (path === "/rest/v1/profiles" && request.method === "GET") {
    const claims = bearerClaims(request);
    return response.end(JSON.stringify(requestedIds(url).map((id) => profileFor(id, claims)).filter(Boolean)));
  }
  if (path === "/rest/v1/profiles" && request.method === "PATCH") {
    // RLS: a student may update only their own row.
    const claims = bearerClaims(request);
    const [id] = requestedIds(url);
    if (!id || id !== claims.sub) return response.end("[]");
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const updated = { ...profileFor(id, claims), ...JSON.parse(raw) };
    profiles.set(id, updated);
    return response.end(JSON.stringify([updated]));
  }
  if (path === "/rest/v1/posts" && request.method === "GET") {
    const matches = (key, value) => !url.searchParams.has(key) || url.searchParams.get(key) === `eq.${value}`;
    // Search fixtures are visible only to exact detail-page lookups, so they
    // never alter the existing feed/profile test datasets.
    const candidates = url.searchParams.get("id")?.startsWith("eq.f143") ? postSearchFixtures : [pinnedPost];
    const found = candidates.filter((post) => ["id", "author_id", "status"].every((key) => matches(key, post[key])));
    return response.end(JSON.stringify([...found, ...matchingPosts(url.searchParams), ...matchingSkillSwapPosts(url.searchParams)]));
  }
  if (path === "/rest/v1/app_logs" && request.method === "POST") {
    response.statusCode = 201;
    return response.end("{}");
  }
  if (path === "/rest/v1/rpc/current_suspension" && request.method === "POST") {
    // Verified browser-test users are active. Keep this explicit because the
    // login action fails closed when account status cannot be checked.
    return response.end("[]");
  }
  if (path === "/rest/v1/categories" && request.method === "GET") {
    return response.end(JSON.stringify([
      { id: 1, name: "General" },
      { id: 2, name: "Questions" },
      { id: 3, name: "Announcements" },
      { id: 4, name: "Events" }
    ]));
  }

  // Sprint 2 tables: posts, comments, upvotes and saved posts.
  if (handleCourses(request, response, url, bearerEmail(request))) return;
  if (handleRatings(request, response, url, bearerClaims(request))) return;
  if (await handleReviews(request, response, url, bearerClaims(request))) return;
  if (await handlePostSearch(request, response, url, bearerClaims(request), [pinnedPost, ...matchingPosts(new URLSearchParams())])) return;
  if (await handleCommunity(request, response, url)) return;
  // SP2-36: conversations and messages, limited to the caller like RLS.
  const caller = bearerClaims(request).sub ?? null;
  const profileName = (id) => profiles.get(id)?.full_name ?? null;
  if (await handleMessaging(request, response, url, { userId: caller, profileName })) return;
  // SP2-40: notifications, limited to the caller like RLS.
  if (await handleNotifications(request, response, url, { userId: caller })) return;
  // SP2-53: SkillSwap posts and their details.
  if (await handleSkillSwap(request, response, url, { userId: caller })) return;
  if (await handleClubs(request, response, url, bearerClaims(request))) return;
  if (await handlePlanner(request, response, url, bearerClaims(request))) return;
  if (path === "/rest/v1/user_roles") {
    roleLookups++;
    const email = bearerEmail(request);
    if (email === "clubs-representative@mail.aub.edu") return response.end(JSON.stringify([{ role: "club_representative" }]));
    if (email === "clubs-admin@mail.aub.edu") return response.end(JSON.stringify([{ role: "administrator" }]));
    response.statusCode = 404;
    return response.end(JSON.stringify({ code: "PGRST205", message: "Could not find the table 'public.user_roles' in the schema cache", details: null, hint: null }));
  }
  response.statusCode = 500;
  response.end(JSON.stringify({ message: "Unexpected request to local test fixture" }));
}).listen(3101, "127.0.0.1");
