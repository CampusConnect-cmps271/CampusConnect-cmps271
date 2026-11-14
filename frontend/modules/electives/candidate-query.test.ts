import { beforeAll, afterAll, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
import { benchmarkDatabase,databaseClient } from "@/tests/performance/database.mjs";
import type { PGlite } from "@electric-sql/pglite";
import type { CourseSection } from "@/modules/courses/semesters";
import type { OfferingPreferences } from "./schema";
import { sectionMatches } from "./offering-matches";
import { fetchCandidateCatalogue } from "./candidate-query";
import { rankCandidates } from "./ranking";
const base={interests:["software security"],academic_goals:"Learn",preferred_workload:"moderate" as const,completed_course_codes:[]};
const section:CourseSection={crn:"12345",section:"1",title:"Security",credits:3,instructors:["Alice"],attributes:["Science","Writing"],prerequisites:"CMPS 241",campus:"Main",details_url:null,source_updated_at:null,restrictions:null,
  sessions:[{days:"MW",start:"09:00",end:"10:15",type:"Lecture",location:"Test Hall",instructor:"Alice"}]};
const cases:[CourseSection,OfferingPreferences][]=[
  [section,{}],[section,{instructors:["ALICE (P)"]}],[section,{instructors:["Bob"]}],
  [section,{attributes:["Science","Writing"]}],[section,{attributes:["Humanities"]}],
  [section,{meeting_days:["M","W"],earliest_start:"09:00",latest_end:"10:15"}],
  [section,{meeting_days:["M"]}],[section,{earliest_start:"09:01"}],[section,{latest_end:"10:14"}],
  [{...section,sessions:[]},{earliest_start:"09:00"}],
  [{...section,sessions:[{...section.sessions[0],days:"TBA"}]},{meeting_days:["M","W"]}],
  [{...section,sessions:[{...section.sessions[0],days:" M W "}]},{meeting_days:["M","W"]}],
  [{...section,sessions:[{...section.sessions[0],start:"TBA"}]},{latest_end:"11:00"}],
  [{...section,sessions:[...section.sessions,{...section.sessions[0],days:"T",start:"11:00",end:"12:00"}]},{meeting_days:["M","W"]}],
  [{...section,sessions:[{...section.sessions[0],start:"10:15",end:"09:00"}]},{latest_end:"11:00"}],
  [{...section,instructors:["Élodie"]},{instructors:["éLODIE"]}],
];
let db:PGlite;
beforeAll(async()=>{
  const courses=["Software Security","Softwares security","Software design","Cryptography","ＡＩ security","برمجة حاسوب","Café security"].map((name,i)=>({id:`30000000-0000-4000-8000-${String(i).padStart(12,"0")}`,code:`TEST ${100+i}`,name,department:"Testing",description:"Synthetic class",prerequisites:"CMPS 241",credits:3}));
  const snapshots=[{id:"40000000-0000-4000-8000-000000000001",semester:{id:"202720",name:"Spring test"},fetched_at:"2026-11-08T00:00:00Z",courses:[
    {...courses[0],title:courses[0].name,instructors:["Alice","Bob"],attributes:["Science","Writing","Humanities"],prerequisite_variants:["CMPS 241"],sections:[section,{...section,crn:"12346",section:"2",instructors:["Bob"],attributes:["Humanities"]}],source_updated_at:null}
  ]}];
  db=await benchmarkDatabase({courses,ratings:[]},snapshots);
},30000);
afterAll(async()=>{await db?.close();});
it.each(cases.map((c,i)=>[i,...c] as const))("SQL and JS section matching agree for case %s",async(_i,s,prefs)=>{
  const result=await db.query<{matches:boolean}>("select public.elective_section_matches($1::jsonb,$2::jsonb) as matches",[JSON.stringify(s),JSON.stringify(prefs)]);
  expect(result.rows[0].matches).toBe(sectionMatches(s,prefs));
});
it("requires one section to satisfy every condition and preserves course-wide counts",async()=>{
  const client=databaseClient(db,0);
  const noMatch=await fetchCandidateCatalogue(client,{...base,offering_preferences:{semester_id:"202720",instructors:["Alice"],attributes:["Humanities"]}});
  expect(noMatch.value).toMatchObject({courses:[],catalogueCount:0});
  const matched=await fetchCandidateCatalogue(client,{...base,offering_preferences:{semester_id:"202720",instructors:["Bob"],attributes:["Humanities"]}});
  expect(matched.value.courses[0].offering?.sections.map(s=>s.section)).toEqual(["2"]);
  expect(matched.value.catalogueCount).toBe(1);
  expect(matched.value.courses[0].prerequisites).toBe("CMPS 241");
});
it.each(["software security","cryptography","AI security","برمجة","café"])("retains whole-word and Unicode matching for %s",async interest=>{
  const result=await fetchCandidateCatalogue(databaseClient(db,0),{...base,interests:[interest]});
  const ranked=rankCandidates(result.value.courses,{...base,interests:[interest]});
  expect(ranked.length).toBeGreaterThan(0);
  expect(result.value.catalogueCount).toBe(7);
  if(interest==="software security")expect(ranked.map(c=>c.code)).toEqual(["TEST 100"]);
});
it("denies anonymous execution and obeys the caller's course RLS",async()=>{
  await db.exec("reset role; set role anon");
  await expect(db.query("select public.elective_candidate_page()" )).rejects.toMatchObject({code:"42501"});
  await db.exec(`reset role; alter policy "Signed-in students can read the course catalogue" on public.courses using (code<>'TEST 100'); set role authenticated`);
  const data=await fetchCandidateCatalogue(databaseClient(db,0),base);expect(data.value.courses.map(c=>c.code)).not.toContain("TEST 100");
  await db.exec('reset role; alter policy "Signed-in students can read the course catalogue" on public.courses using (true); set role authenticated');
});
it("rejects unbounded or malformed direct RPC arguments",async()=>{
  await expect(db.query("select public.elective_candidate_page('[]','{}',0,1001)")).rejects.toMatchObject({code:"22023"});
  await expect(db.query("select public.elective_candidate_page('{}','{}')")).rejects.toMatchObject({code:"22023"});
});
