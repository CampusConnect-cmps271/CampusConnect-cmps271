import { courses } from "./mock-courses.mjs";
const preferences = new Map();
export const electiveAccounts = {
  "electives-owner@mail.aub.edu": "00000000-0000-4000-8000-000000000301",
  "electives-other@mail.aub.edu": "00000000-0000-4000-8000-000000000302",
  "electives-ranking@mail.aub.edu": "00000000-0000-4000-8000-000000000303",
  "electives-empty@mail.aub.edu": "00000000-0000-4000-8000-000000000304",
};
export async function handleElectives(request, response, url, claims) {
  if (!claims.email?.startsWith("electives-")) return false;
  const json = (value, status = 200) => { response.statusCode = status; response.end(JSON.stringify(value)); return true; };
  if (url.pathname === "/rest/v1/courses" && request.method === "GET") {
    if (claims.email === "electives-empty@mail.aub.edu") return json([]);
    let rows = courses;
    const code = url.searchParams.get("code");
    if (code?.startsWith("in.")) rows = rows.filter(row => code.includes(row.code));
    return json(rows);
  }
  if (url.pathname !== "/rest/v1/elective_preferences") return false;
  if (!claims.sub) return json({ code: "42501" }, 403);
  if (request.method === "GET") {
    const row = preferences.get(claims.sub);
    const columns = url.searchParams.get("select")?.split(",") ?? [];
    return json(row ? Object.fromEntries(columns.map(key => [key, row[key]])) : null);
  }
  if (request.method === "POST") {
    let raw = ""; for await (const chunk of request) raw += chunk;
    const row = JSON.parse(raw);
    if (row.student_id !== claims.sub) return json({ code: "42501" }, 403);
    preferences.set(claims.sub, row); return json(null, 201);
  }
  return false;
}
