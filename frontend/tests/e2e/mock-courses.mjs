// Entirely synthetic records: these fixtures never contact hosted Supabase.
const courses = [
  ...Array.from({ length: 27 }, (_, index) => ({
    code: `CMPS ${101 + index}`, name: `Computing elective ${index + 1}`,
    credits: 3, department: "Computer Science", description: "A synthetic computing course for catalogue browser tests. Students explore programming techniques, practical problem solving, and the social context of computing.\n\nThe final project brings together the full set of topics covered during the term. This sentence marks the end of the complete course description.",
  })),
  { code: "CMPS 240", name: "Operating Systems", credits: 3, department: "Computer Science", description: "A synthetic description about operating systems for browser tests.", prerequisites: "Prerequisite: CMPS101 or CMPS 102. Instructor consent may also be required." },
  { code: "CMPS 241", name: "Systems Programming", credits: 3, department: "Computer Science", description: "A synthetic description about systems programming for browser tests.", prerequisites: "Prerequisite: CMPS 101 and CHEM 999, or consent of instructor." },
  { code: "CMPS 261", name: "Machine Learning", credits: 3, department: "Computer Science", description: "Statistical learning and predictive models.", prerequisites: "Prerequisites: CMPS 101, 102 or 103." },
  { code: "MATH 201", name: "Calculus III", credits: 3, department: "Mathematics", description: "Multivariable calculus and applications." },
  { code: "MATH 202", name: "Differential Equations", credits: 3, department: "Mathematics", description: "Ordinary differential equations and modelling." },
].map((course, index) => ({ prerequisites: "", ...course, id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}` }));

function like(pattern, text) {
  let regex = "";
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index];
    if (char === "\\" && index + 1 < pattern.length) {
      regex += pattern[++index].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    } else if (char === "%" || char === "*") regex += ".*";
    else if (char === "_") regex += ".";
    else regex += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${regex}$`, "iu").test(text);
}

export function handleCourses(request, response, url, email) {
  if (url.pathname !== "/rest/v1/courses") return false;
  if (!email || email === "courses-unavailable@mail.aub.edu") {
    response.statusCode = 403;
    response.end(JSON.stringify({ code: "42501", message: "Synthetic database failure details must never reach the page" }));
    return true;
  }
  let rows = [...courses];
  const id = url.searchParams.get("id");
  if (id?.startsWith("eq.")) rows = rows.filter((course) => course.id === id.slice(3));
  const code = url.searchParams.get("code");
  if (code?.startsWith("eq.")) rows = rows.filter((course) => course.code === code.slice(3));
  if (code?.startsWith("in.")) {
    if (email === "courses-links-unavailable@mail.aub.edu") {
      response.statusCode = 403;
      response.end(JSON.stringify({ code: "42501", message: "Synthetic prerequisite lookup failure" }));
      return true;
    }
    const codes = code.slice(4, -1).split(",").map((value) => value.replace(/^"|"$/g, ""));
    rows = rows.filter((course) => codes.includes(course.code));
  }
  const department = url.searchParams.get("department");
  if (department) rows = rows.filter((course) => course.department === department.slice(3));
  const or = url.searchParams.get("or");
  if (or) {
    const parts = or.match(/^\(code\.ilike\.("(?:\\.|[^"\\])*"),name\.ilike\.("(?:\\.|[^"\\])*")\)$/);
    if (!parts) {
      response.statusCode = 400;
      response.end(JSON.stringify({ code: "PGRST100", message: "Malformed search filter" }));
      return true;
    }
    rows = rows.filter((course) => like(JSON.parse(parts[1]), course.code) || like(JSON.parse(parts[2]), course.name));
  }
  rows.sort((a, b) => a.department.localeCompare(b.department) || a.code.localeCompare(b.code) || a.id.localeCompare(b.id));
  const total = rows.length;
  const start = Number(url.searchParams.get("offset") ?? 0);
  const limit = Number(url.searchParams.get("limit") ?? 1000);
  rows = rows.slice(start, start + limit);
  response.setHeader("Content-Range", total ? `${start}-${start + rows.length - 1}/${total}` : "*/0");
  if (request.method === "HEAD") response.end();
  else response.end(JSON.stringify(url.searchParams.get("select") === "department"
    ? rows.map(({ department }) => ({ department })) : rows));
  return true;
}
