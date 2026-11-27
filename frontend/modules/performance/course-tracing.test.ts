import { afterEach, expect, it, vi } from "vitest";
import { trace } from "@opentelemetry/api";
vi.mock("server-only",()=>({}));
import { courseTraceState, traceCoursePhase, attachCourseRequestId } from "./course-tracing";
afterEach(()=>{vi.restoreAllMocks();courseTraceState().traces.clear();courseTraceState().installed=false;});
it("runs work once when disabled and preserves the original failure",async()=>{
  const failure=new Error('NEXT_REDIRECT'),work=vi.fn().mockRejectedValue(failure);
  await expect(traceCoursePhase('page_auth',work)).rejects.toBe(failure);expect(work).toHaveBeenCalledTimes(1);
});
it("preserves returns and redirects when span completion fails",async()=>{
  const state=courseTraceState();state.installed=true;const tid='1'.repeat(32);
  state.traces.set(tid,{rootId:'2'.repeat(16),startedAt:0,phases:{}});
  vi.spyOn(trace,'getActiveSpan').mockReturnValue({spanContext:()=>({traceId:tid})} as ReturnType<typeof trace.getActiveSpan>);
  const end=vi.fn(()=>{throw Error('telemetry');});vi.spyOn(trace,'getTracer').mockReturnValue({startSpan:()=>({end,spanContext:()=>({traceId:tid})})} as unknown as ReturnType<typeof trace.getTracer>);
  const value={id:'value'};expect(await traceCoursePhase('catalogue_load',async()=>value)).toBe(value);
  const failure=new Error('NEXT_REDIRECT'),work=vi.fn().mockRejectedValue(failure);await expect(traceCoursePhase('page_auth',work)).rejects.toBe(failure);expect(work).toHaveBeenCalledTimes(1);
  attachCourseRequestId('private-not-an-id');expect(state.traces.get(tid)?.requestId).toBeUndefined();
  attachCourseRequestId('10000000-0000-4000-8000-000000000001');expect(state.traces.get(tid)?.requestId).toBeDefined();
});
