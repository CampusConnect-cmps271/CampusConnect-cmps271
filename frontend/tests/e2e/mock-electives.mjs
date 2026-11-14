import { ratingFixture } from "./mock-reviews.mjs";
import { courses, handleCourses } from "./mock-courses.mjs";
const preferences = new Map();
const electiveCourses = [...courses, {
  id: "10000000-0000-4000-8000-999999999991", code: "EECE 463", name: "Computing and Robotics",
  description: "Learn programming and computing through robotics.", department: "Electrical and Computer Engineering",
  credits: 3, prerequisites: "Prerequisite: CMPS 101 or instructor consent.",
}];
export const electiveAccounts = {
  "recommendations-browse@mail.aub.edu": "00000000-0000-4000-8000-000000000507",
  "recommendations-offerings@mail.aub.edu": "00000000-0000-4000-8000-000000000506",
  "recommendations-ranking@mail.aub.edu": "00000000-0000-4000-8000-000000000501",
  "recommendations-empty@mail.aub.edu": "00000000-0000-4000-8000-000000000502",
  "recommendations-no-major@mail.aub.edu": "00000000-0000-4000-8000-000000000503",
  "recommendations-groups@mail.aub.edu": "00000000-0000-4000-8000-000000000504",
  "recommendations-ai@mail.aub.edu": "00000000-0000-4000-8000-000000000505",
};
const groupedCourses = [
  { code: "CMPS 201", name: "Software Design", description: "Software architecture and development." },
  { code: "CMPS 202", name: "Security Policy", description: "Security governance and policy." },
  { code: "CMPS 203", name: "Software Protection", description: "Security testing and auditing." },
  { code: "EECE 463", name: "Cryptography", description: "Encryption and mathematical protocols." },
  { code: "ECON 215", name: "Econometrics II", description: "Statistical estimation and economic modelling." },
].map((course, index) => ({ ...course, id: `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`, department: course.code.split(" ")[0], credits: 3, prerequisites: "None" }));
export async function handleElectives(request, response, url, claims) {
  if (!Object.hasOwn(electiveAccounts, claims.email ?? "")) return false;
  const json = (value, status = 200) => { response.statusCode = status; response.end(JSON.stringify(value)); return true; };
  if (url.pathname === "/rest/v1/rpc/elective_candidate_page" && request.method === "POST") {
    let raw=""; for await (const chunk of request) raw+=chunk;
    const args=JSON.parse(raw),filters=args.p_filters??{};
    let rows=claims.email === "recommendations-empty@mail.aub.edu" ? [] : claims.email === "recommendations-groups@mail.aub.edu" ? groupedCourses : electiveCourses;
    const norm=value=>value.replace(/\s*\(P\)\s*$/,"").trim().toLowerCase();
    if(filters.semester_id){
      const capture={setHeader(){},end(body){rows=JSON.parse(body);}};
      handleCourses({method:"GET"},capture,new URL(`http://mock/rest/v1/course_semester_catalogue?semester_id=eq.${filters.semester_id}`),claims.email);
      rows=rows.map(row=>({...row,sections:row.sections.map(section=>claims.email === "recommendations-browse@mail.aub.edu"?{...section,attributes:["Culture and History"]}:section).filter(section=>{
        if(filters.instructors?.length&&!filters.instructors.some(w=>section.instructors.some(v=>norm(v)===norm(w))))return false;
        if(filters.attributes?.some(w=>!section.attributes.some(v=>norm(v)===norm(w))))return false;
        if(!filters.meeting_days?.length&&!filters.earliest_start&&!filters.latest_end)return true;
        return section.sessions.length>0&&section.sessions.every(meeting=>{
          const days=meeting.days.replace(/\s/g,"");
          if(filters.meeting_days?.length&&(!/^[MTWRFSU]+$/.test(days)||[...days].some(d=>!filters.meeting_days.includes(d))))return false;
          if(filters.earliest_start&&meeting.start<filters.earliest_start)return false;
          if(filters.latest_end&&meeting.end>filters.latest_end)return false;
          return true;
        });
      })})).filter(row=>row.sections.length);
    }
    if(claims.email === "recommendations-browse@mail.aub.edu" && filters.semester_id && rows.length){
      rows=Array.from({length:53},(_,i)=>({...rows[0],id:`30000000-0000-4000-8000-${String(i).padStart(12,"0")}`,code:`HIST ${200+i}`,name:`Culture and History ${i+1}`,description:"Study culture, history and societies.",sections:rows[0].sections.map(section=>({...section,attributes:["Culture and History"],connected_crns:["29999"]}))}));
    }
    const catalogue_count=rows.length;
    rows=rows.map(row=>{const rating=courses.some(c=>c.id===row.id)?ratingFixture(row):{};return {...row,review_count:rating.review_count??null,average_workload:rating.average_workload??null,average_overall:rating.average_overall??null,
      offering:filters.semester_id?{semester_id:row.semester_id,semester_name:row.semester_name,synced_at:row.synced_at,sections:row.sections}:null};});
    return json({catalogue_count,candidate_count:rows.length,courses:rows.slice(args.p_offset,args.p_offset+args.p_limit)});
  }
  if (url.pathname === "/rest/v1/courses" && request.method === "GET") {
    if (claims.email === "recommendations-empty@mail.aub.edu") return json([]);
    let rows = claims.email === "recommendations-groups@mail.aub.edu" ? groupedCourses : electiveCourses;
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
