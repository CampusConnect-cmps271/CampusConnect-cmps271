import { courses } from "./mock-courses.mjs";
import { ratingInputs } from "./mock-reviews.mjs";

// Read-only, synthetic baseline reviews from other students. Actual test form
// submissions are included too, so threshold changes exercise server revalidation.
const samples = {
  "CMPS 102": [[1, 2, 3, 4]],
  "CMPS 103": [[1, 1, 1, 1], [5, 5, 5, 5]],
  "CMPS 104": [[2, 3, 4, 5], [3, 4, 5, 4], [5, 1, 2, 3]],
  "CMPS 105": [[1, 2, 3, 4], [2, 3, 4, 5], [3, 4, 5, 1], [4, 5, 1, 2]],
  "CMPS 261": [[1, 2, 3, 4], [5, 4, 3, 2]],
};
const fields = ["difficulty", "workload", "usefulness", "overall"];

export function handleRatings(request, response, url, claims) {
  if (url.pathname !== "/rest/v1/course_rating_averages") return false;
  if (!claims.sub || claims.email === "ratings-unavailable@mail.aub.edu") {
    response.statusCode = 403;
    response.end(JSON.stringify({ code: "42501", message: "Synthetic private ratings failure" }));
    return true;
  }
  let selected = courses;
  const filter = url.searchParams.get("course_id");
  if (filter?.startsWith("in.(")) {
    const ids = filter.slice(4, -1).split(",").map((id) => id.replaceAll('"', ""));
    selected = selected.filter((course) => ids.includes(course.id));
  } else {
    response.statusCode = 400;
    response.end(JSON.stringify({ code: "PGRST100", message: "Rating fixtures require a bounded ID filter" }));
    return true;
  }
  if (claims.email === "ratings-missing@mail.aub.edu") selected = selected.filter((course) => course.code !== "CMPS 104");
  const rows = selected.map((course) => {
    const reviews = [...(samples[course.code] ?? []), ...ratingInputs(course.id).map((review) => fields.map((field) => review[`${field}_rating`]))];
    return {
      course_id: course.id, review_count: reviews.length,
      ...Object.fromEntries(fields.map((field, index) => [`average_${field}`,
        reviews.length ? reviews.reduce((total, ratings) => total + ratings[index], 0) / reviews.length : null,
      ])),
    };
  });
  if (claims.email === "ratings-invalid@mail.aub.edu" && rows.length) rows[0].average_overall = 7;
  response.end(JSON.stringify(rows));
  return true;
}
