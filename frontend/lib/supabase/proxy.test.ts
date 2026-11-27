import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks=vi.hoisted(()=>({claims:vi.fn(),refresh:false}));
vi.mock('@supabase/ssr',()=>({createServerClient:(_url:unknown,_key:unknown,options:{cookies:{setAll:(cookies:{name:string;value:string;options:object}[],headers:Record<string,string>)=>void}})=>({auth:{getClaims:async()=>{
 if(mocks.refresh)options.cookies.setAll([{name:'refreshed-session',value:'fresh',options:{httpOnly:true}}],{'Cache-Control':'private, no-store'});
 return mocks.claims();
}}})}));
vi.mock('./config',()=>({getSupabaseConfig:()=>({url:'http://127.0.0.1:3101',publishableKey:'test'})}));
import { updateSession } from './proxy';
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();mocks.refresh=false;});
it('replaces spoofed IDs and preserves the generated ID through cookie refresh',async()=>{
 vi.stubEnv('COURSE_TRACING_ENABLED','true');mocks.refresh=true;mocks.claims.mockReturnValue({data:{claims:{sub:'verified-account'}}});
 const response=await updateSession(new NextRequest('http://localhost/courses?q=test',{headers:{'x-cc-request-id':'spoofed'}}));
 const id=response.headers.get('x-cc-request-id');expect(id).toMatch(/^[0-9a-f-]{36}$/);expect(id).not.toBe('spoofed');expect(response.headers.get('x-middleware-request-x-cc-request-id')).toBe(id);
 expect(response.cookies.get('refreshed-session')?.value).toBe('fresh');expect(response.headers.get('cache-control')).toBe('private, no-store');
});
it('strips incoming correlation IDs when tracing is disabled',async()=>{
 vi.stubEnv('COURSE_TRACING_ENABLED','false');mocks.claims.mockReturnValue({data:{claims:null}});
 const response=await updateSession(new NextRequest('http://localhost/courses',{headers:{'x-cc-request-id':'spoofed'}}));
 expect(response.headers.has('x-cc-request-id')).toBe(false);expect(response.headers.has('x-middleware-request-x-cc-request-id')).toBe(false);
});
