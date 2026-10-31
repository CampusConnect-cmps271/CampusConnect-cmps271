import { courses } from "./mock-courses.mjs";

// Isolated synthetic accounts; no hosted database or real student records.
export const electivePreferenceAccounts = {
  "electives-owner@mail.aub.edu": "00000000-0000-4000-8000-000000000301",
  "electives-other@mail.aub.edu": "00000000-0000-4000-8000-000000000302",
  "electives-native@mail.aub.edu": "00000000-0000-4000-8000-000000000303",
  "electives-failure@mail.aub.edu": "00000000-0000-4000-8000-000000000304",
  "electives-validation@mail.aub.edu": "00000000-0000-4000-8000-000000000306",
};
const preferences = new Map();

export async function handleElectivePreferences(request, response, url, claims) {
  if (!Object.hasOwn(electivePreferenceAccounts, claims.email ?? "")) return false;
  const json = (value, status = 200) => {
    response.statusCode = status;
    response.end(JSON.stringify(value));
    return true;
  };
  if (url.pathname === "/rest/v1/courses" && request.method === "GET") {
    const codes = (url.searchParams.get("code") ?? "").slice(4, -1).split(",").map(code => code.replaceAll('"', ""));
    return json(courses.filter(row => codes.includes(row.code)).map(row => ({ code: row.code })));
  }
  if (url.pathname !== "/rest/v1/elective_preferences") return false;
  if (request.method === "GET") {
    const row = url.searchParams.get("student_id") === `eq.${claims.sub}` ? preferences.get(claims.sub) : null;
    const columns = url.searchParams.get("select")?.split(",") ?? [];
    return json(row ? Object.fromEntries(columns.map(key => [key, row[key]])) : null);
  }
  if (request.method === "POST") {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const row = JSON.parse(raw);
    if (row.student_id !== claims.sub) return json({ code: "42501" }, 403);
    if (claims.email === "electives-failure@mail.aub.edu") return json({ message: "Synthetic private SQL details" }, 500);
    preferences.set(claims.sub, row);
    return json(null, 201);
  }
  return false;
}
