import { expect, it, vi } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const m = vi.hoisted(() => ({ client: null as unknown, user: { id: "benchmark-student" } }));
vi.mock("server-only",()=>({}));
vi.mock("@/modules/auth",()=>({ requireUser: async()=>m.user }));
vi.mock("@/lib/supabase/server",()=>({ createClient: async()=>m.client }));
import { loadCandidates as baseline } from "./baseline-catalogue";
import { loadCandidates as optimized } from "@/modules/electives/catalogue";
import { candidateCache } from "@/modules/electives/candidate-cache";
import { recommend } from "@/modules/electives/recommendations";
import type { ElectivePreferences } from "@/modules/electives/schema";
import { benchmarkDatabase, databaseClient } from "./database.mjs";
const percentile = (values: number[], fraction: number) => [...values].sort((a,b)=>a-b)[Math.ceil(values.length*fraction)-1];
it("records equivalent catalogue recommendations before and after the optimization", async()=>{
  const fixturePath=process.env.PERF_FIXTURE;
  if(!fixturePath) throw new Error("Set PERF_FIXTURE to a local, credential-free catalogue JSON export. No provider calls are made.");
  const fixture=JSON.parse(await readFile(resolve(fixturePath),"utf8"));
  const snapshots=await Promise.all(["202710","202720"].map(async id=>JSON.parse(await readFile(resolve(`.resis-cache/snapshot-${id}.json`),"utf8"))));
  const db=await benchmarkDatabase(fixture,snapshots);
  const latency=Number(process.env.PERF_LATENCY_MS ?? 75), samples=Number(process.env.PERF_SAMPLES ?? 5);
  const client=databaseClient(db,latency); m.client=client;
  const base: ElectivePreferences={ interests:["software security","cryptography"], academic_goals:"software",preferred_workload:"moderate",completed_course_codes:[] };
  const scenarios=[{name:"All courses",preferences:base},
    {name:"Spring semester",preferences:{...base,offering_preferences:{semester_id:"202720"}}},
    {name:"Spring schedule",preferences:{...base,interests:["computer","software"],offering_preferences:{semester_id:"202720",meeting_days:["M","W","F"],earliest_start:"09:00",latest_end:"16:00"}} as ElectivePreferences},
    {name:"No matches",preferences:{...base,interests:["zzzznomatchinginterest"]}}];
  const results=[];
  try {
    for(const scenario of scenarios){
      let reference: unknown;
      for(const mode of ["before","cold","warm"]){
        const timings=[],queries=[],bytes=[],dbTimes=[];
        for(let sample=0;sample<samples;sample++){
          if(mode!=="warm") candidateCache.clear();
          client.reset(); const started=performance.now();
          const catalogue=await (mode==="before"?baseline:optimized)(scenario.preferences);
          const result=await recommend(scenario.preferences,catalogue);
          const elapsed=performance.now()-started;
          const facts={ recommendations: result.recommendations.map(c=>({...c, ...(c.offering ? {offering:{...c.offering,synced_at:new Date(c.offering.synced_at).toISOString()}} : {})})), catalogueCount:result.catalogueCount };
          if(mode==="before") reference=facts; else expect(facts).toEqual(reference);
          timings.push(elapsed);queries.push(client.stats.requests);bytes.push(client.stats.bytes);dbTimes.push(client.stats.dbMs);
        }
        results.push({scenario:scenario.name,mode,samples,medianMs:percentile(timings,.5),p95Ms:percentile(timings,.95),requests:percentile(queries,.5),responseBytes:percentile(bytes,.5),databaseMedianMs:percentile(dbTimes,.5)});
      }
    }
    const report={ generatedAt:new Date().toISOString(), baselineCommit:"39b0ebb", courses:fixture.courses.length,
      latencyMs:latency, environment:"Local PGlite replay of saved course/semester data; added latency per database request. Excludes sign-in, profile, proxy and AI latency; bytes are JSON payload, not compressed wire bytes.", results };
    await writeFile(process.env.PERF_OUTPUT??"/tmp/elective-performance.json",JSON.stringify(report,null,2));
    console.table(results);expect(results).toHaveLength(12);
  } finally { await db.close(); }
});
