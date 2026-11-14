import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({config:vi.fn(),get:vi.fn(),set:vi.fn()}));
vi.mock("@upstash/redis",()=>({Redis:class { constructor(options:unknown){m.config(options);}get(key:string){return m.get(key);}set(...args:unknown[]){return m.set(...args);} }}));
import {createRedisCandidateStore,configuredCandidateRedis,candidateRedisNamespace,CANDIDATE_TTL_MS} from "./upstash-candidate-cache";
import {createCandidateCache,candidateCacheKey} from "./candidate-cache";
import { recommend } from "./recommendations";
const course={id:"10000000-0000-4000-8000-000000000001",code:"CMPS 271",name:"Software Engineering",description:"Software development",department:"Computer Science",prerequisites:"CMPS 202",credits:3,review_count:0,average_workload:null,average_overall:null};
const value={courses:[course],truncated:false,catalogueCount:3380};
const diagnostics={cache:"miss" as const,dbRequests:1,responseBytes:1000,queryMs:75};
const result=()=>({value:structuredClone(value),diagnostics});
function backend(now:()=>number){
 const data=new Map<string,{raw:string,until:number}>();
 const client={get:vi.fn(async(key:string)=>{const v=data.get(key);return v&&v.until>now()?v.raw:null;}),set:vi.fn(async(key:string,raw:string,{px}:{px:number})=>{data.set(key,{raw,until:now()+px});return "OK";})};
 return {client,data};
}
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
it("reuses the same student's data across independent server instances without a second DB query",async()=>{
 let now=1000;const shared=backend(()=>now),store=createRedisCandidateStore(shared.client,"test",()=>now);
 const first=createCandidateCache(()=>now,()=>store),second=createCandidateCache(()=>now,()=>store),load=vi.fn(async()=>result());
 const key=candidateCacheKey("student-a",{p_groups:[["software"]],p_filters:{semester_id:"202720"}});
 expect((await first.load(key,load)).diagnostics).toMatchObject({cacheTier:"database",redisRead:"miss",redisWrite:"stored"});
 const hit=await second.load(key,load);expect(hit.value).toEqual(value);expect(hit.diagnostics).toMatchObject({cache:"hit",cacheTier:"redis",dbRequests:0});
 expect(load).toHaveBeenCalledOnce();expect(shared.client.get).toHaveBeenCalledTimes(2);
 await second.load(key,load);expect(shared.client.get).toHaveBeenCalledTimes(2);
 const otherKey=candidateCacheKey("student-b",{p_groups:[["software"]],p_filters:{semester_id:"202720"}});await second.load(otherKey,load);expect(load).toHaveBeenCalledTimes(2);
 now+=1000;
});
it("inherits the Redis expiry instead of extending freshness for another 30 seconds",async()=>{
 let now=1000;const shared=backend(()=>now),store=createRedisCandidateStore(shared.client,"expiry",()=>now),load=vi.fn(async()=>result());
 await createCandidateCache(()=>now,()=>store).load("key",load);
 now+=29000;const other=createCandidateCache(()=>now,()=>store);expect((await other.load("key",load)).diagnostics.cacheTier).toBe("redis");
 now+=1001;expect((await other.load("key",load)).diagnostics.cacheTier).toBe("database");expect(load).toHaveBeenCalledTimes(2);
});
it("bounds outages and bypasses Redis temporarily after an error",async()=>{
 let now=1000;const client={get:vi.fn().mockRejectedValue(new Error("private Redis details")),set:vi.fn()};const store=createRedisCandidateStore(client,"outage",()=>now),cache=createCandidateCache(()=>now,()=>store),load=vi.fn(async()=>result());
 expect((await cache.load("one",load)).diagnostics).toMatchObject({cacheTier:"database",redisRead:"error",redisWrite:"circuit_open"});
 expect((await cache.load("two",load)).value).toEqual(value);expect(client.get).toHaveBeenCalledOnce();expect(client.set).not.toHaveBeenCalled();
 now+=30001;await cache.load("three",load);expect(client.get).toHaveBeenCalledTimes(2);
});
it("does not discard a successful database result when a Redis write fails",async()=>{
 const client={get:vi.fn().mockResolvedValue(null),set:vi.fn().mockRejectedValue(new Error("private token"))};const cache=createCandidateCache(()=>1000,()=>createRedisCandidateStore(client,"write",()=>1000));
 expect(await cache.load("key",async()=>result())).toMatchObject({value,diagnostics:{redisWrite:"error",cacheTier:"database"}});
});
it.each(["not JSON",JSON.stringify({version:0}),JSON.stringify({version:1,key:"wrong",expiresAt:30000,value}),JSON.stringify({version:1,key:"key",expiresAt:999,value}),JSON.stringify({version:1,key:"key",expiresAt:90000,value}),JSON.stringify({version:1,key:"key",expiresAt:30000,value:{...value,courses:[{...course,code:99}]}})])("treats invalid, wrongly scoped or expired cache data as a miss: %s",async(raw)=>{
 const client={get:vi.fn().mockResolvedValue(raw),set:vi.fn().mockResolvedValue("OK")};const store=createRedisCandidateStore(client,"invalid",()=>1000),load=vi.fn(async()=>result());
 expect((await createCandidateCache(()=>1000,()=>store).load("key",load)).value).toEqual(value);expect(load).toHaveBeenCalledOnce();
});
it("skips large Redis entries while retaining the bounded memory cache",async()=>{
 const shared=backend(()=>1000),store=createRedisCandidateStore(shared.client,"large",()=>1000),cache=createCandidateCache(()=>1000,()=>store);
 const large={...value,courses:Array.from({length:20},()=>({...course,description:"x".repeat(20000)}))};
 expect((await cache.load("key",async()=>({value:large,diagnostics}))).diagnostics.redisWrite).toBe("oversize");expect(shared.client.set).not.toHaveBeenCalled();
 expect((await cache.load("key",async()=>{throw new Error("should use memory");})).diagnostics.cacheTier).toBe("memory");
});
it("never writes failed database loads into Redis",async()=>{
 const shared=backend(()=>1000),store=createRedisCandidateStore(shared.client,"failed",()=>1000);
 await expect(createCandidateCache(()=>1000,()=>store).load("key",async()=>{throw new Error("database unavailable");})).rejects.toThrow("database unavailable");expect(shared.client.set).not.toHaveBeenCalled();
});
it("normalizes key order without mixing users, projects or filter values",()=>{
 const a={p_groups:[["security","software"],["cryptography"]],p_filters:{semester_id:"202720",meeting_days:["M","W"]}};
 const b={p_filters:{meeting_days:["W","M"],semester_id:"202720"},p_groups:[["cryptography"],["software","security"]]};
 expect(candidateCacheKey("a",a)).toBe(candidateCacheKey("a",b));expect(candidateCacheKey("a",a)).not.toBe(candidateCacheKey("b",a));
 expect(candidateRedisNamespace({VERCEL_ENV:"production"})).not.toBe(candidateRedisNamespace({VERCEL_ENV:"preview"}));
 expect(CANDIDATE_TTL_MS).toBe(30000);
});
it("keeps Redis unconfigured in automatic tests and rejects non-Upstash credential destinations",()=>{
 vi.stubEnv("UPSTASH_REDIS_REST_URL","https://test.upstash.io");vi.stubEnv("UPSTASH_REDIS_REST_TOKEN","synthetic-redis-token-only");
 expect(configuredCandidateRedis()).toBeUndefined();
 vi.stubEnv("NODE_ENV","production");vi.stubEnv("UPSTASH_REDIS_REST_URL","https://untrusted.example");expect(configuredCandidateRedis()).toBeUndefined();expect(m.config).not.toHaveBeenCalled();
 vi.stubEnv("UPSTASH_REDIS_REST_URL","https://test.upstash.io");expect(configuredCandidateRedis()).toBeDefined();
 const config=m.config.mock.calls[0][0];expect(config).toMatchObject({retry:{retries:0},enableAutoPipelining:false,enableTelemetry:false,automaticDeserialization:false});
 expect(config.signal()).toBeInstanceOf(AbortSignal);expect(config.signal()).not.toBe(config.signal());
});

it("defers writes beyond the response and retains the original freshness deadline",async()=>{
 let now=1000;const shared=backend(()=>now),store=createRedisCandidateStore(shared.client,"deferred",()=>now);
 const jobs:Array<()=>Promise<void>>=[],load=vi.fn(async()=>result());
 const first=createCandidateCache(()=>now,()=>store);
 const cold=await first.load("key",load,{deferWrite:job=>{jobs.push(job);}});
 expect(cold.diagnostics.redisWrite).toBe("scheduled");expect(shared.client.set).not.toHaveBeenCalled();
 now+=5000;await jobs[0]();expect(shared.client.set.mock.calls[0][2]).toEqual({px:25000});
 const second=createCandidateCache(()=>now,()=>store);
 expect((await second.load("key",load)).diagnostics.cacheTier).toBe("redis");expect(load).toHaveBeenCalledOnce();
 now+=25001;expect((await second.load("key",load)).diagnostics.cacheTier).toBe("database");
});
it("falls back to a synchronous cache write outside a Next request context",async()=>{
 const shared=backend(()=>1000),store=createRedisCandidateStore(shared.client,"context",()=>1000);
 const loaded=await createCandidateCache(()=>1000,()=>store).load("key",async()=>result(),{deferWrite:()=>{throw new Error("No request context");}});
 expect(loaded.diagnostics.redisWrite).toBe("stored");expect(shared.client.set).toHaveBeenCalledOnce();
});
it("skips background writes that start after the original expiry",async()=>{
 let now=1000;const shared=backend(()=>now),store=createRedisCandidateStore(shared.client,"late",()=>now),jobs:Array<()=>Promise<void>>=[];
 await createCandidateCache(()=>now,()=>store).load("key",async()=>result(),{deferWrite:job=>{jobs.push(job);}});
 now+=30001;await jobs[0]();expect(shared.client.set).not.toHaveBeenCalled();
});

it("preserves semester sections, instructors, attributes and prerequisite-aware recommendations through Redis",async()=>{
 const now=()=>1000,shared=backend(now),store=createRedisCandidateStore(shared.client,"semester",now);
 const semesterValue={...value,courses:[{...course,review_count:4,average_workload:2.5,average_overall:4.5,offering:{
  semester_id:"202720",semester_name:"Spring 2027",synced_at:"2026-11-14T08:00:00Z",sections:[{
   crn:"12345",connected_crns:["12346"],connected_labels:["CMPS 271 · Section E1 · Recitation · CRN 12346"],section:"01",title:"Software Engineering",credits:3,instructors:["Professor Example"],attributes:["Quantitative Thought"],prerequisites:"CMPS 202",
   campus:"Beirut",details_url:"https://example.edu/course/12345",source_updated_at:"2026-11-14T07:45:00Z",restrictions:{major:["Computer Science"]},
   sessions:[{days:"MW",start:"10:00",end:"11:15",type:"Lecture",location:"Room 101",instructor:"Professor Example"}],
  }],
 }}]};
 const preferences={interests:["software"],preferred_workload:"moderate" as const,academic_goals:"engineering",completed_course_codes:["CMPS 202"],offering_preferences:{semester_id:"202720",instructors:["Professor Example"],attributes:["Quantitative Thought"],meeting_days:["M" as const,"W" as const],earliest_start:"09:00",latest_end:"12:00"}};
 const key=candidateCacheKey("student",preferences),load=vi.fn(async()=>({value:semesterValue,diagnostics}));
 const cold=await createCandidateCache(now,()=>store).load(key,load);
 const warm=await createCandidateCache(now,()=>store).load(key,load);
 expect(warm.diagnostics.cacheTier).toBe("redis");expect(warm.value).toEqual(cold.value);expect(load).toHaveBeenCalledOnce();
 const before=await recommend(preferences,cold.value),after=await recommend(preferences,warm.value);
 expect(before.recommendations).toHaveLength(1);expect(after).toEqual(before);
 expect(after.recommendations[0]).toMatchObject({prerequisite_status:"satisfied",offering:{sections:[{section:"01",instructors:["Professor Example"],attributes:["Quantitative Thought"],sessions:[{start:"10:00",end:"11:15"}]}]}});
});
