import { describe, expect, it, vi } from "vitest";
import { ROOT_CONTEXT } from "@opentelemetry/api";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import type { CourseTraceState } from "./course-tracing";
vi.mock("server-only", () => ({}));
import { createCourseSpanProcessor } from "./course-trace-processor";
const traceId = "1".repeat(32), rootId = "2".repeat(16);
function span(attributes: Record<string, unknown>, id = rootId, tid = traceId, ms = 350) {
  return { attributes, spanContext: () => ({ traceId: tid, spanId: id, traceFlags: 1 }), duration: [Math.floor(ms / 1000), (ms % 1000) * 1e6] } as unknown as ReadableSpan;
}
const root = () => span({ "next.span_type": "BaseServer.handleRequest", "http.target": "/courses?q=private-search", "next.route": "/courses", "http.status_code": 200, cookie: "secret-cookie", authorization: "secret-token" });
function setup(limit = 30) {
  const state: CourseTraceState = { installed: true, traces: new Map(), registeredAt: 0 };
  const emit = vi.fn(), persist = vi.fn().mockResolvedValue(undefined);let at=0;
  const processor = createCourseSpanProcessor(state, { emit, persist, now: () => at, resources: () => ({ process_rss_mb: 50 }), limit });
  const start = (s: ReadableSpan) => processor.onStart(s as Parameters<typeof processor.onStart>[0], ROOT_CONTEXT);
  return { state, emit, persist, processor, start, advance: (ms: number) => {at=ms;} };
}
describe("bounded private course timing summaries", () => {
  it("joins safe phases without copying queries, headers or errors", async () => {
    const s=setup();s.start(root());
    s.processor.onEnd(span({"cc.phase":"live_session", email:"private@example.test"},"3".repeat(16),traceId,12));
    s.processor.onEnd(span({"cc.phase":"catalogue_cache"},"4".repeat(16),traceId,30));
    s.processor.onEnd(span({"next.span_type":"AppRender.getBodyResult"},"5".repeat(16),traceId,200));
    s.processor.onEnd(root());await s.processor.forceFlush();
    expect(s.emit).toHaveBeenCalledTimes(1);expect(s.persist).toHaveBeenCalledTimes(1);
    const result=s.emit.mock.calls[0][0];expect(result.context.next_request_ms).toBe(350);
    expect(result.context.phases.live_session.total_ms).toBe(12);expect(result.context.phases.next_body.total_ms).toBe(200);
    expect(JSON.stringify(result)).not.toMatch(/private-search|secret-cookie|secret-token|private@example|authorization/);
    expect(s.state.traces.size).toBe(0);
  });
  it("ignores unrelated routes, unknown phase names and middleware-only spans", () => {
    const s=setup();s.start(span({"next.span_type":"BaseServer.handleRequest","http.target":"/messages/private-user"}));
    expect(s.state.traces.size).toBe(0);
    const middleware=span({"next.span_type":"BaseServer.handleRequest","http.target":"/courses"});s.start(middleware);s.processor.onEnd(middleware);
    expect(s.emit).not.toHaveBeenCalled();expect(s.state.traces.size).toBe(0);
    s.start(root());s.processor.onEnd(span({"cc.phase":"private-email","next.span_type":"__proto__"},"3".repeat(16)));s.processor.onEnd(root());
    expect(s.emit.mock.calls[0][0].context.phases).toEqual({});
  });
  it("caps active traces and expires abandoned requests", () => {
    const s=setup();for(let i=0;i<140;i++)s.start(span({"next.span_type":"BaseServer.handleRequest","http.target":"/courses"},rootId,i.toString(16).padStart(32,'0')));
    expect(s.state.traces.size).toBe(128);s.advance(120001);s.start(root());expect(s.state.traces.size).toBe(1);
  });
  it("bounds records per minute and clears suppressed requests", () => {
    const s=setup(2);for(let i=0;i<3;i++){s.start(root());s.processor.onEnd(root());}
    expect(s.emit).toHaveBeenCalledTimes(2);expect(s.state.traces.size).toBe(0);
    s.advance(60001);s.start(root());s.processor.onEnd(root());expect(s.emit).toHaveBeenCalledTimes(3);
  });
  it("does not leak overlapping roots into the current render", () => {
    const s=setup();s.start(root());const second=span({...root().attributes},"4".repeat(16));s.start(second);s.processor.onEnd(root());
    expect(s.emit).not.toHaveBeenCalled();s.processor.onEnd(second);expect(s.emit).toHaveBeenCalledTimes(1);
  });
  it("tolerates output/persistence failures without throwing", async () => {
    const s=setup();s.emit.mockImplementation(()=>{throw Error('logging failure');});s.persist.mockRejectedValue(Error('offline'));
    s.start(root());expect(()=>s.processor.onEnd(root())).not.toThrow();await expect(s.processor.forceFlush()).resolves.toBeUndefined();expect(s.state.traces.size).toBe(0);
  });
});
