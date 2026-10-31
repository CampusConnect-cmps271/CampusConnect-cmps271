import { courses } from "./mock-courses.mjs";
const preferences = new Map();
const electiveCourses = [...courses, {
  id: "10000000-0000-4000-8000-999999999991", code: "EECE 463", name: "Computing and Robotics",
  description: "Learn programming and computing through robotics.", department: "Electrical and Computer Engineering",
  credits: 3, prerequisites: "Prerequisite: CMPS 101 or instructor consent.",
}];
export const electiveAccounts = {
  "electives-owner@mail.aub.edu": "00000000-0000-4000-8000-000000000301",
  "electives-other@mail.aub.edu": "00000000-0000-4000-8000-000000000302",
  "electives-ranking@mail.aub.edu": "00000000-0000-4000-8000-000000000303",
  "electives-empty@mail.aub.edu": "00000000-0000-4000-8000-000000000304",
  "electives-no-major@mail.aub.edu": "00000000-0000-4000-8000-000000000305",
};
export async function handleElectives(request, response, url, claims) {
  if (!claims.email?.startsWith("electives-")) return false;
  const json = (value, status = 200) => { response.statusCode = status; response.end(JSON.stringify(value)); return true; };
  if (url.pathname === "/rest/v1/courses" && request.method === "GET") {
    if (claims.email === "electives-empty@mail.aub.edu") return json([]);
    let rows = electiveCourses;
    const code = url.searchParams.get("code");
    if (code?.startsWith("in.")) rows = rows.filter(row => code.slice(4, -1).split(",").map(value => value.replaceAll('"', "")).includes(row.code));
    const start = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? rows.length);
    return json(rows.slice(start, start + limit));
  }
  if (url.pathname === "/rest/v1/course_reviews" && request.method === "GET") {
    const courseId = url.searchParams.get("course_id")?.slice(3) ?? courses[0].id;
    const rows = [
      { id: "40000000-0000-4000-8000-000000000001", course_id: courseId, body: "Clear explanations and useful projects.", overall_rating: 5, workload_rating: 2, status: "published" },
      { id: "40000000-0000-4000-8000-000000000002", course_id: courseId, body: "Heavy weekly workload.", overall_rating: 1, workload_rating: 5, status: "published" },
      { id: "40000000-0000-4000-8000-000000000003", course_id: courseId, body: "Useful but demanding.", overall_rating: 3, workload_rating: 4, status: "published" },
      { id: "40000000-0000-4000-8000-000000000004", course_id: courseId, body: "Removed evidence must not appear.", overall_rating: 1, workload_rating: 5, status: "removed" },
    ].filter(row => !url.searchParams.get("status") || url.searchParams.get("status") === `eq.${row.status}`);
    response.setHeader("Content-Range", `0-${rows.length - 1}/${rows.length}`);
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
