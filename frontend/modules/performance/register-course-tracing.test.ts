import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
type Config = {spanProcessors:unknown[];instrumentations:unknown[];autoDetectResources:boolean;flushTimeoutMillis:number;traceSampler:{toString():string}};
type ProcessorOptions = {persist?: (entry:Record<string,unknown>)=>Promise<void>};
const mocks=vi.hoisted(()=>({register:vi.fn<(config:Config)=>void>(),processor:vi.fn<(state:unknown,options:ProcessorOptions)=>object>(()=>({})),admin:vi.fn()}));
vi.mock("@vercel/otel",()=>({registerOTel:mocks.register}));
vi.mock("./course-trace-processor",()=>({createCourseSpanProcessor:mocks.processor}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:mocks.admin}));
import { courseTraceState } from "./course-tracing";
import { registerCourseTracing } from "./register-course-tracing";
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();courseTraceState().installed=false;});
it("registers once with an explicit processor and no automatic collection",async()=>{
 vi.stubEnv('COURSE_TRACING_ENABLED','true');vi.stubEnv('COURSE_TRACE_SAMPLE_RATE','invalid');
 const abort=vi.fn().mockResolvedValue({error:null}),insert=vi.fn(()=>({abortSignal:abort})),from=vi.fn(()=>({insert}));mocks.admin.mockReturnValue({from});
 registerCourseTracing();registerCourseTracing();expect(mocks.register).toHaveBeenCalledTimes(1);
 const config=mocks.register.mock.calls[0][0];expect(config.spanProcessors).toHaveLength(1);expect(config.instrumentations).toEqual([]);expect(config.autoDetectResources).toBe(false);expect(config.flushTimeoutMillis).toBe(1500);expect(config.traceSampler.toString()).toContain('0.1');
 const options=mocks.processor.mock.calls[0][1] as unknown as {persist:(entry:Record<string,unknown>)=>Promise<void>};
 await options.persist({context:{route:'/courses',next_request_ms:20}});
 expect(from).toHaveBeenCalledWith('app_logs');expect(insert).toHaveBeenCalledWith({level:'info',source:'server',event:'performance.course_request',user_id:null,message:null,context:{route:'/courses',next_request_ms:20}});expect(abort.mock.calls[0][0]).toBeInstanceOf(AbortSignal);
});
it("supports disabling registration or persistence",()=>{
 vi.stubEnv('COURSE_TRACING_ENABLED','false');registerCourseTracing();expect(mocks.register).not.toHaveBeenCalled();
 vi.stubEnv('COURSE_TRACING_ENABLED','true');vi.stubEnv('COURSE_TRACE_PERSIST_ENABLED','false');registerCourseTracing();expect(mocks.processor.mock.calls[0][1]).toEqual({persist:undefined});
});
