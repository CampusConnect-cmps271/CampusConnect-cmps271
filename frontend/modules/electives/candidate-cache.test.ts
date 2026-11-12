import { expect,it,vi } from "vitest";
vi.mock("server-only",()=>({}));
import {createCandidateCache,candidateCacheKey} from "./candidate-cache";
const value={courses:[],truncated:false,catalogueCount:3380};
const diagnostics={cache:"miss" as const,dbRequests:1,responseBytes:100,queryMs:50};
it("expires entries after 30 seconds and protects cached values against caller mutation",async()=>{
  let now=0;const cache=createCandidateCache(()=>now),load=vi.fn(async()=>({value:{...value},diagnostics}));
  await cache.load("key",load);const hit=await cache.load("key",load);hit.value.catalogueCount=0;
  expect((await cache.load("key",load)).value.catalogueCount).toBe(3380);
  now=30001;expect((await cache.load("key",load)).diagnostics.cache).toBe("miss");expect(load).toHaveBeenCalledTimes(2);
});
it("coalesces concurrent identical reads but never caches a rejection",async()=>{
  const cache=createCandidateCache();let release!:()=>void;
  const load=vi.fn(async()=>{await new Promise<void>(r=>release=r);return {value,diagnostics};});
  const first=cache.load("key",load),second=cache.load("key",load);release();
  expect((await second).diagnostics.cache).toBe("coalesced");await first;expect(load).toHaveBeenCalledOnce();
  const failed=vi.fn().mockRejectedValue(new Error("unavailable"));await expect(cache.load("bad",failed)).rejects.toThrow();await expect(cache.load("bad",failed)).rejects.toThrow();expect(failed).toHaveBeenCalledTimes(2);
});
it("bounds entries and hashes student, project and query identity",async()=>{
  const cache=createCandidateCache(),load=vi.fn(async()=>({value,diagnostics}));
  for(let i=0;i<65;i++)await cache.load(String(i),load);
  expect((await cache.load("0",load)).diagnostics.cache).toBe("miss");
  expect(candidateCacheKey("one",{interest:"private"})).not.toBe(candidateCacheKey("two",{interest:"private"}));
  expect(candidateCacheKey("one",{interest:"private"})).not.toContain("private");
});
