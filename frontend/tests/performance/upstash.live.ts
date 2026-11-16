import { it,expect,vi } from "vitest";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { Redis } from "@upstash/redis";
vi.mock("server-only",()=>({}));
import { configuredCandidateRedis,candidateRedisNamespace } from "@/modules/electives/upstash-candidate-cache";
import { createCandidateCache,candidateCacheKey } from "@/modules/electives/candidate-cache";
it("verifies cross-instance Upstash reuse with a disposable synthetic record",async()=>{
 if(process.env.UPSTASH_LIVE_VERIFY!=="1")throw new Error("Explicit opt-in required: UPSTASH_LIVE_VERIFY=1 npm run verify:redis");
 process.loadEnvFile(".env.local");
 vi.stubEnv("NODE_ENV","production");vi.stubEnv("UPSTASH_REDIS_CACHE_NAMESPACE","verification-"+randomUUID());
 const store=configuredCandidateRedis();if(!store)throw new Error("Configure the server-only Upstash REST URL/token first.");
 const key=candidateCacheKey("synthetic-verification-student",{p_groups:[["software"]],p_filters:{semester_id:"202720"}});
 const client=new Redis({url:process.env.UPSTASH_REDIS_REST_URL!,token:process.env.UPSTASH_REDIS_REST_TOKEN!,retry:{retries:0},signal:()=>AbortSignal.timeout(2000),enableTelemetry:false,enableAutoPipelining:false});
 const value={catalogueCount:1,truncated:false,courses:[{id:"00000000-0000-4000-8000-000000000001",code:"TEST 100",name:"Synthetic Software Test",description:"Disposable cache verification record",department:"Testing",prerequisites:"None",credits:3,review_count:0,average_workload:null,average_overall:null}]};
 const load=vi.fn(async()=>({value,diagnostics:{cache:"miss" as const,dbRequests:1,responseBytes:100,queryMs:0}}));
 const first=createCandidateCache(()=>Date.now(),()=>store),second=createCandidateCache(()=>Date.now(),()=>store);
 const results=[];
 const jobs:Array<()=>Promise<void>>=[];let backgroundWriteMs=0;
 try{
  for(const [name,cache] of [["cold",first],["memory",first],["independent_instance",second]] as const){
   const before=load.mock.calls.length,start=performance.now();const result=await cache.load(key,load,{deferWrite:job=>{jobs.push(job);}});
   expect(result.value).toEqual(value);
   results.push({scenario:name,elapsedMs:performance.now()-start,loaderCalls:load.mock.calls.length-before,diagnostics:result.diagnostics});
   if(name==="cold"){const began=performance.now();for(const job of jobs)await job();backgroundWriteMs=performance.now()-began;}
  }
  expect(results[0].diagnostics.redisWrite).toBe("scheduled");expect(results[1].diagnostics.cacheTier).toBe("memory");expect(results[2].diagnostics.cacheTier).toBe("redis");expect(load).toHaveBeenCalledOnce();
  const ttl=await client.pttl(`campusconnect:electives:v3:${candidateRedisNamespace()}:${key}`);expect(ttl).toBeGreaterThan(0);expect(ttl).toBeLessThanOrEqual(30000);
  await writeFile(process.env.UPSTASH_VERIFY_OUTPUT??"/tmp/upstash-live-results.json",JSON.stringify({date:new Date().toISOString(),sdk:"@upstash/redis 1.41.0",environment:"Local machine to Tokyo Upstash; actual network, synthetic candidate data, no Supabase or Resis calls",ttlMs:ttl,backgroundWriteMs,results},null,2));
 }finally{await client.del(`campusconnect:electives:v3:${candidateRedisNamespace()}:${key}`);vi.unstubAllEnvs();}
});
