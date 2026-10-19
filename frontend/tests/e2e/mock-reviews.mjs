import { randomUUID } from "node:crypto";

// Synthetic review storage, scoped by distinct test-user IDs and RLS-like rules.
const reviews = [];
const editable = new Set(["difficulty_rating", "workload_rating", "usefulness_rating", "overall_rating", "body", "semester_taken", "completed_course"]);
let tick = 0;
const timestamp = () => new Date(Date.now() + ++tick).toISOString();

export function ratingInputs(courseId) {
  return reviews.filter((review) => review.course_id === courseId);
}

const samples = {
  "CMPS 102": [[1, 2, 3, 4]],
  "CMPS 103": [[1, 1, 1, 1], [5, 5, 5, 5]],
  "CMPS 104": [[2, 3, 4, 5], [3, 4, 5, 4], [5, 1, 2, 3]],
  "CMPS 105": [[1, 2, 3, 4], [2, 3, 4, 5], [3, 4, 5, 1], [4, 5, 1, 2]],
  "CMPS 127": [[2, 2, 4, 3], [3, 2, 5, 4], [4, 2, 3, 5]],
  "CMPS 261": [[1, 2, 3, 4], [5, 4, 3, 2]],
};
const ratingFields = ["difficulty", "workload", "usefulness", "overall"];

export function ratingFixture(course) {
  const rows = [...(samples[course.code] ?? []), ...ratingInputs(course.id).map((review) => ratingFields.map((field) => review[`${field}_rating`]))];
  return {
    course_id: course.id, review_count: rows.length,
    ...Object.fromEntries(ratingFields.map((field, index) => [`average_${field}`,
      rows.length ? rows.reduce((total, ratings) => total + ratings[index], 0) / rows.length : null,
    ])),
  };
}

export async function handleReviews(request, response, url, claims) {
  if (url.pathname !== "/rest/v1/course_reviews") return false;
  const fail = (code, message, status = 403) => {
    response.statusCode = status;
    response.end(JSON.stringify({ code, message, details: "Synthetic fixture failure" }));
    return true;
  };
  if (!claims.sub) return fail("42501", "Not signed in");
  if (claims.email === "reviews-load-failure@mail.aub.edu" && request.method === "GET") return fail("57014", "Synthetic internal details");
  const matching = (row) => [...url.searchParams].every(([field, filter]) => {
    if (filter.startsWith("eq.")) return String(row[field]) === filter.slice(3);
    if (filter.startsWith("gte.")) return String(row[field]) >= filter.slice(4);
    return true;
  });
  let found = reviews.filter(matching);
  if (request.method === "POST" || request.method === "PATCH") {
    if (claims.email === "reviews-save-failure@mail.aub.edu") return fail("57014", "Synthetic internal details");
    if (claims.email === "reviews-pending@mail.aub.edu") await new Promise((resolve) => setTimeout(resolve, 1000));
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const payload = JSON.parse(raw);
    if (request.method === "POST") {
      const student = payload.student_id ?? claims.sub;
      if (student !== claims.sub) return fail("42501", "Owner mismatch");
      if (reviews.some((row) => row.course_id === payload.course_id && row.student_id === student)) return fail("23505", "Duplicate", 409);
      const row = { ...payload, student_id: student, id: randomUUID(), created_at: timestamp(), updated_at: timestamp() };
      reviews.push(row);
      found = [row];
    } else {
      if (Object.keys(payload).some((key) => !editable.has(key))) return fail("42501", "Protected column");
      found = found.filter((row) => row.student_id === claims.sub);
      for (const row of found) Object.assign(row, payload, { updated_at: timestamp() });
    }
  } else if (request.method === "DELETE") {
    found = found.filter((row) => row.student_id === claims.sub);
    for (const row of found) reviews.splice(reviews.indexOf(row), 1);
  } else if (request.method === "GET") {
    found.sort((a, b) => b.created_at.localeCompare(a.created_at));
    found = found.slice(0, Number(url.searchParams.get("limit") ?? 1000));
  } else return fail("405", "Unsupported method", 405);

  const single = request.headers.accept?.includes("object+json");
  if (single && found.length !== 1) {
    response.statusCode = 406;
    response.end(JSON.stringify({ code: "PGRST116", details: `The result contains ${found.length} rows`, message: "Cannot coerce to a single object" }));
  } else response.end(JSON.stringify(single ? found[0] : found));
  return true;
}
