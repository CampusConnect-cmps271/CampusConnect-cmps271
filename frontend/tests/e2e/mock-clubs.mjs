const REP_ID = "00000000-0000-4000-8000-000000000201";
const ADMIN_ID = "00000000-0000-4000-8000-000000000202";
const ROBOTICS_ID = "20000000-0000-4000-8000-000000000001";

export const clubFixtures = [
  { id: ROBOTICS_ID, slug: "robotics-club", name: "Robotics Club", description: "Students building robots, sharing engineering skills, and competing together.", category: "Technology", public_email: "robotics@example.edu", public_website: "https://example.edu/robotics", verification_status: "verified", verification_reason: null },
  { id: "20000000-0000-4000-8000-000000000002", slug: "debate-society", name: "Debate Society", description: "Practice public speaking and discuss important questions with fellow students.", category: "Academic", public_email: null, public_website: null, verification_status: "pending", verification_reason: null },
  ...Array.from({ length: 9 }, (_, index) => ({ id: `20000000-0000-4000-8000-${String(index + 3).padStart(12, "0")}`, slug: `campus-club-${index + 3}`, name: `Campus Club ${index + 3}`, description: "A synthetic campus organization used only by browser tests.", category: index % 2 ? "Service" : "Culture", public_email: null, public_website: null, verification_status: index === 0 ? "rejected" : "pending", verification_reason: index === 0 ? "Missing documentation" : null })),
];

let announcements = [{ id: "30000000-0000-4000-8000-000000000001", club_id: ROBOTICS_ID, author_id: REP_ID, title: "Robotics workshop", body: "Bring your laptop and join our robotics workshop next Wednesday.", status: "published", published_at: "2026-10-24T10:00:00Z", created_at: "2026-10-24T10:00:00Z", updated_at: "2026-10-24T10:00:00Z" }];

function json(response, value, status = 200) { response.statusCode = status; response.end(JSON.stringify(value)); return true; }
function eq(url, key) { const value = url.searchParams.get(key); return value?.startsWith("eq.") ? value.slice(3) : null; }
function parseBody(request) { return new Promise((resolve) => { let raw = ""; request.on("data", (chunk) => raw += chunk); request.on("end", () => resolve(raw ? JSON.parse(raw) : {})); }); }
function selected(row, select) {
  if (!select || select === "*") return row;
  return Object.fromEntries(select.split(",").filter((key) => key in row).map((key) => [key, row[key]]));
}

export async function handleClubs(request, response, url, claims) {
  if (url.pathname === "/rest/v1/clubs" && request.method === "GET") {
    let rows = [...clubFixtures];
    const slug = eq(url, "slug"); if (slug) rows = rows.filter((club) => club.slug === slug);
    const category = eq(url, "category"); if (category) rows = rows.filter((club) => club.category === category);
    if (url.searchParams.get("verification_status") === "eq.pending") rows = rows.filter((club) => club.verification_status === "pending");
    const or = url.searchParams.get("or");
    if (or) { const term = or.match(/name\.ilike\.%(.+?)%/)?.[1]?.replaceAll("\\", "")?.toLowerCase() ?? ""; rows = rows.filter((club) => `${club.name} ${club.description}`.toLowerCase().includes(term)); }
    rows.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    const total = rows.length, offset = Number(url.searchParams.get("offset") ?? 0), limit = Number(url.searchParams.get("limit") ?? 1000);
    rows = rows.slice(offset, offset + limit);
    response.setHeader("Content-Range", total ? `${offset}-${offset + rows.length - 1}/${total}` : "*/0");
    return json(response, rows.map((row) => selected(row, url.searchParams.get("select"))));
  }
  if (url.pathname === "/rest/v1/club_memberships" && request.method === "GET") {
    const clubId = eq(url, "club_id"), userId = eq(url, "user_id");
    const rows = claims.sub === REP_ID && clubId === ROBOTICS_ID && userId === REP_ID ? [{ club_id: ROBOTICS_ID, user_id: REP_ID, role: "representative" }] : [];
    return json(response, rows);
  }
  if (url.pathname === "/rest/v1/club_announcements" && request.method === "GET") {
    let rows = announcements.filter((item) => (!eq(url, "club_id") || item.club_id === eq(url, "club_id")) && (!eq(url, "id") || item.id === eq(url, "id")));
    if (eq(url, "status")) rows = rows.filter((item) => item.status === eq(url, "status"));
    if (claims.sub !== REP_ID && claims.sub !== ADMIN_ID) rows = rows.filter((item) => item.status === "published");
    return json(response, rows);
  }
  if (url.pathname === "/rest/v1/club_announcements" && request.method === "POST") {
    if (claims.sub !== REP_ID && claims.sub !== ADMIN_ID) return json(response, { code: "42501" }, 403);
    const body = await parseBody(request); const created = { ...body, id: "30000000-0000-4000-8000-000000000099", created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    announcements.push(created); return json(response, created, 201);
  }
  if (url.pathname === "/rest/v1/club_announcements" && request.method === "PATCH") {
    const index = announcements.findIndex((item) => item.id === eq(url, "id") && item.club_id === eq(url, "club_id"));
    if (index < 0 || (claims.sub !== REP_ID && claims.sub !== ADMIN_ID)) return json(response, []);
    announcements[index] = { ...announcements[index], ...await parseBody(request), updated_at: new Date().toISOString() };
    return json(response, [announcements[index]]);
  }
  if (url.pathname === "/rest/v1/rpc/request_club_verification" && request.method === "POST") return json(response, claims.sub === REP_ID ? null : { code: "42501" }, claims.sub === REP_ID ? 200 : 403);
  if (url.pathname === "/rest/v1/rpc/review_club_verification" && request.method === "POST") return json(response, claims.sub === ADMIN_ID ? null : { code: "42501" }, claims.sub === ADMIN_ID ? 200 : 403);
  return false;
}

export const clubTestAccounts = { REP_ID, ADMIN_ID };
