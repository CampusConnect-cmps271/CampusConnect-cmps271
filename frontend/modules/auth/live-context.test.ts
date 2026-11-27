import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ getClaims:vi.fn(), getUser:vi.fn(), rpc:vi.fn(), from:vi.fn(), warn:vi.fn() }));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({auth:m,rpc:m.rpc,from:m.from})}));
vi.mock("@/modules/logging",()=>({log:{warn:m.warn}}));
vi.mock("next/navigation",()=>({redirect:(path:string):never=>{throw new Error(`REDIRECT:${path}`);}}));
vi.mock("next/headers",()=>({headers:async()=>new Headers()}));
import { getCurrentUser } from "./session";
const a="00000000-0000-4000-8000-000000000001", b="00000000-0000-4000-8000-000000000002";
const claims=()=>({sub:a,session_id:b,role:"authenticated",aud:"authenticated",iss:"http://127.0.0.1:3101/auth/v1",exp:Math.floor(Date.now()/1000)+3600});
const context=()=>({id:a,email:"one@example.test",confirmed:true,profile_name:" Profile One ",metadata_full_name:"Registration",metadata_name:null});
beforeEach(()=>{
  vi.resetAllMocks();vi.stubEnv("AUTH_LIVE_CONTEXT_ENABLED","true");vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL","http://127.0.0.1:3101");
  m.getClaims.mockResolvedValue({data:{claims:claims()},error:null});m.rpc.mockResolvedValue({data:context(),error:null});
});
afterEach(()=>vi.unstubAllEnvs());
describe("verified live session context",()=>{
  it("uses one live RPC and no Auth-user or profile request",async()=>{
    expect(await getCurrentUser()).toEqual({id:a,email:"one@example.test",name:"Profile One"});
    expect(m.rpc).toHaveBeenCalledExactlyOnceWith("get_my_session_context");expect(m.getUser).not.toHaveBeenCalled();expect(m.from).not.toHaveBeenCalled();
  });
  it("redirects on live unconfirmed state rather than editable metadata",async()=>{
    m.rpc.mockResolvedValue({data:{...context(),confirmed:false},error:null});
    await expect(getCurrentUser()).rejects.toThrow("REDIRECT:/verify-email?email=one%40example.test");
  });
  it("never falls back after revocation, RPC denial or an invalid response",async()=>{
    for(const result of [{data:null,error:null},{data:null,error:{code:"42501"}},{data:{...context(),id:b},error:null},{data:{...context(),confirmed:"true"},error:null},{data:{},error:null}]){
      m.rpc.mockResolvedValueOnce(result);expect(await getCurrentUser()).toBeNull();
    }
    m.rpc.mockRejectedValueOnce(new Error("offline"));expect(await getCurrentUser()).toBeNull();expect(m.getUser).not.toHaveBeenCalled();
  });
  it("rejects invalid verification, expiry, issuer, subject, session, role or audience before the RPC",async()=>{
    for(const patch of [{sub:"bad"},{session_id:undefined},{exp:0},{iss:"https://other.test/auth/v1"},{role:"anon"},{aud:"other"}]){
      m.getClaims.mockResolvedValueOnce({data:{claims:{...claims(),...patch}},error:null});expect(await getCurrentUser()).toBeNull();
    }
    m.getClaims.mockResolvedValueOnce({data:{claims:claims()},error:{code:"bad_jwt"}});expect(await getCurrentUser()).toBeNull();
    m.getClaims.mockRejectedValueOnce(new Error("offline"));expect(await getCurrentUser()).toBeNull();
    expect(m.rpc).not.toHaveBeenCalled();expect(m.getUser).not.toHaveBeenCalled();
  });
  it("keeps display fallbacks without trusting them for authorization",async()=>{
    for(const [patch,name] of [[{profile_name:" "},"Registration"],[{profile_name:null,metadata_full_name:"",metadata_name:" Nick "},"Nick"],[{profile_name:null,metadata_full_name:null},"one"],[{profile_name:null,metadata_full_name:null,email:null},"student"]] as const){
      m.rpc.mockResolvedValueOnce({data:{...context(),...patch},error:null});expect((await getCurrentUser())?.name).toBe(name);
    }
  });
  it("reads changed live context for later requests and different identities",async()=>{
    expect((await getCurrentUser())?.id).toBe(a);
    m.getClaims.mockResolvedValue({data:{claims:{...claims(),sub:b}},error:null});
    m.rpc.mockResolvedValue({data:{...context(),id:b,profile_name:"Another Student"},error:null});
    expect(await getCurrentUser()).toEqual({id:b,email:"one@example.test",name:"Another Student"});expect(m.rpc).toHaveBeenCalledTimes(2);
  });
});
