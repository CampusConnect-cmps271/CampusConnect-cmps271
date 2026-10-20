import { courses } from "./mock-courses.mjs";
import { ratingFixture } from "./mock-reviews.mjs";

// Read-only, synthetic baseline reviews from other students. Actual test form
// submissions are included too, so threshold changes exercise server revalidation.
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
  const rows = selected.map(ratingFixture);
  if (claims.email === "ratings-invalid@mail.aub.edu" && rows.length) rows[0].average_overall = 7;
  response.end(JSON.stringify(rows));
  return true;
}
