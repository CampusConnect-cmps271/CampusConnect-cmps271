import { beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({user:vi.fn(),rpc:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/modules/auth",()=>({requireUser:m.user}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({rpc:m.rpc})}));
import { loadCandidates } from "./catalogue";
import { candidateCache } from "./candidate-cache";
const preferences={interests:["software security"],preferred_workload:"moderate" as const,academic_goals:"Learn",completed_course_codes:[]};
const course=(i:number)=>({id:`course-${i}`,code:`CMPS ${i}`,name:"Software Security",description:"Security and software",department:"Computing",prerequisites:"CMPS 101",credits:3,review_count:3,average_workload:2.5,average_overall:4});
beforeEach(()=>{vi.clearAllMocks();candidateCache.clear();m.user.mockResolvedValue({id:"owner"});m.rpc.mockResolvedValue({data:{catalogue_count:3380,candidate_count:1,courses:[course(200)]},error:null});});
it("retrieves filtered candidates and ratings in one request while retaining the full scope count",async()=>{
  const result=await loadCandidates(preferences);
  expect(m.rpc).toHaveBeenCalledOnce();
  expect(m.rpc).toHaveBeenCalledWith("elective_candidate_page",{p_groups:[["software","security"]],p_filters:{},p_offset:0,p_limit:1000});
  expect(result).toMatchObject({catalogueCount:3380,truncated:false,courses:[{review_count:3,average_workload:2.5}],diagnostics:{cache:"miss",dbRequests:1}});
});
it("pages through more than 5000 matching courses without a cutoff",async()=>{
  const rows=Array.from({length:6001},(_,i)=>course(i));
  m.rpc.mockImplementation(async(_name,args)=>({data:{catalogue_count:6001,candidate_count:6001,courses:rows.slice(args.p_offset,args.p_offset+1000)},error:null}));
  expect((await loadCandidates()).courses).toHaveLength(6001);expect(m.rpc).toHaveBeenCalledTimes(7);
});
it("rejects substring and partial-group false positives after the coarse database filter",async()=>{
  m.rpc.mockResolvedValue({data:{catalogue_count:3380,candidate_count:2,courses:[{...course(200),name:"Software Security",description:""},{...course(201),name:"Softwares security",description:""}]},error:null});
  expect((await loadCandidates(preferences)).courses.map(c=>c.code)).toEqual(["CMPS 200"]);
});
it("authenticates every cache hit and keeps students and choices isolated",async()=>{
  expect((await loadCandidates(preferences)).diagnostics.cache).toBe("miss");
  expect((await loadCandidates(preferences)).diagnostics).toMatchObject({cache:"hit",dbRequests:0,responseBytes:0});
  expect(m.user).toHaveBeenCalledTimes(2);expect(m.rpc).toHaveBeenCalledOnce();
  m.user.mockResolvedValue({id:"other"});await loadCandidates(preferences);expect(m.rpc).toHaveBeenCalledTimes(2);
  await loadCandidates({...preferences,interests:["cryptography"]});expect(m.rpc).toHaveBeenCalledTimes(3);
  m.user.mockRejectedValue(new Error("redirect"));await expect(loadCandidates(preferences)).rejects.toThrow("redirect");expect(m.rpc).toHaveBeenCalledTimes(3);
});
it("does not cache errors or leak private database error messages",async()=>{
  m.rpc.mockResolvedValueOnce({data:null,error:{message:"private SQL details"}});
  await expect(loadCandidates(preferences)).rejects.toThrow("The course catalogue is temporarily unavailable.");
  expect((await loadCandidates(preferences)).courses).toHaveLength(1);expect(m.rpc).toHaveBeenCalledTimes(2);
});
it("retains unknown ratings and handles zero candidates without a ratings round trip",async()=>{
  m.rpc.mockResolvedValue({data:{catalogue_count:3380,candidate_count:0,courses:[]},error:null});
  expect(await loadCandidates(preferences)).toMatchObject({courses:[],catalogueCount:3380});expect(m.rpc).toHaveBeenCalledOnce();
});
