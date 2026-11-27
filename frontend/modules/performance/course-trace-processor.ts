import "server-only";
import type { SpanProcessor, ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import { addPhase, COURSE_PHASES, type CourseTraceState } from "./course-tracing";

const frameworkPhases: Record<string, string> = {
  "AppRender.getBodyResult": "next_body",
  "AppRender.renderToReadableStream": "next_stream",
  "NextNodeServer.findPageComponents": "next_components",
  "NextNodeServer.createComponentTree": "next_tree",
  "NextNodeServer.sendRenderResult": "next_send",
};
const round = (n: number) => Math.round(n * 100) / 100;
const pathOf = (value: unknown) => {
  if (typeof value !== "string") return null;
  try { return new URL(value, "http://diagnostic.invalid").pathname; } catch { return null; }
};
const id = (value: string, length: number) => new RegExp(`^[0-9a-f]{${length}}$`, "i").test(value);

/** One bounded numeric record per sampled /courses Next request span.
 * No generic span exporter, headers, URLs/queries, identities or error text.
 */
export function createCourseSpanProcessor(state: CourseTraceState, options: {
  emit?: (entry: Record<string, unknown>) => void;
  now?: () => number;
  resources?: () => Record<string, number>;
  persist?: (entry: Record<string, unknown>) => Promise<void>;
  limit?: number;
} = {}): SpanProcessor {
  const emit = options.emit ?? (entry => console.info(JSON.stringify(entry)));
  const now = options.now ?? (() => performance.now());
  const instanceId = randomUUID();
  let windowStart = now(), emitted = 0, lastCpu = process.cpuUsage(), lastCpuAt = now(), lastElu = performance.eventLoopUtilization();
  const resources = options.resources ?? (() => {
    const currentAt = now(), seconds = Math.max(.001, (currentAt - lastCpuAt) / 1000);
    const cpu = process.cpuUsage(lastCpu), elu = performance.eventLoopUtilization(lastElu), memory = process.memoryUsage();
    lastCpu = process.cpuUsage(); lastCpuAt = currentAt; lastElu = performance.eventLoopUtilization();
    return { process_age_ms: round(process.uptime() * 1000), process_rss_mb: round(memory.rss / 1048576), process_heap_used_mb: round(memory.heapUsed / 1048576), process_cpu_window_ms: round(seconds * 1000), process_cpu_cores_in_window: round((cpu.user + cpu.system) / 1e6 / seconds), process_event_loop_utilization: round(elu.utilization) };
  });
  const pending = new Set<Promise<void>>();
  const limit = Math.min(120, Math.max(1, options.limit ?? 30));
  return {
    onStart(span) {
      try {
        if (span.attributes["next.span_type"] !== "BaseServer.handleRequest" || pathOf(span.attributes["http.target"]) !== "/courses") return;
        const at = now();
        for (const [key, value] of state.traces) if (at - value.startedAt > 120_000) state.traces.delete(key);
        const ctx = span.spanContext();
        if (state.traces.size >= 128 || !id(ctx.traceId, 32) || !id(ctx.spanId, 16)) return;
        state.traces.set(ctx.traceId, { rootId: ctx.spanId, startedAt: at, phases: {} });
      } catch { /* Ignore telemetry failure. */ }
    },
    onEnd(span: ReadableSpan) {
      try {
        const ctx = span.spanContext(), current = state.traces.get(ctx.traceId);
        if (!current) return;
        const ms = span.duration[0] * 1000 + span.duration[1] / 1e6;
        if (ctx.spanId !== current.rootId) {
          const phase = span.attributes["cc.phase"];
          if (typeof phase === "string" && (COURSE_PHASES as readonly string[]).includes(phase)) addPhase(current, phase, ms);
          const framework = span.attributes["next.span_type"];
          if (typeof framework === "string" && Object.hasOwn(frameworkPhases, framework)) addPhase(current, frameworkPhases[framework], ms);
          return;
        }
        state.traces.delete(ctx.traceId);
        // Middleware-only passes do not have the resolved page route.
        const route = span.attributes["next.route"] ?? span.attributes["http.route"];
        if (route !== "/courses" && route !== "/(protected)/courses") return;
        if (!Number.isFinite(ms) || ms < 0) return;
        const at = now();
        if (at - windowStart >= 60_000) { windowStart = at; emitted = 0; }
        if (emitted++ >= limit) return;
        const phases = Object.fromEntries(Object.entries(current.phases).map(([key, value]) => [key, { calls: value.calls, total_ms: round(value.total_ms), max_ms: round(value.max_ms) }]));
        const status = span.attributes["http.status_code"];
        const commit = process.env.VERCEL_GIT_COMMIT_SHA;
        const region = process.env.VERCEL_REGION;
        const entry = { ts: new Date().toISOString(), level: "info", event: "performance.course_request", context: {
          route: "/courses", trace_id: ctx.traceId, span_id: ctx.spanId, request_id: current.requestId ?? null,
          instance_id: instanceId, next_request_ms: round(ms), phases,
          response_kind: span.attributes["next.rsc"] === true ? "rsc" : "document",
          status: typeof status === "number" && status >= 100 && status <= 599 ? status : null,
          region: region && /^[a-z]{3}[0-9]$/.test(region) ? region : null,
          commit: commit && /^[0-9a-f]{40}$/i.test(commit) ? commit : null,
          ...resources(),
        } };
        try { emit(entry); } catch { /* Keep optional sinks independent. */ }
        if (options.persist && pending.size < 16) {
          const write = Promise.resolve().then(() => options.persist!(entry)).catch(() => {}).finally(() => pending.delete(write));
          pending.add(write);
        }
      } catch { /* Ignore telemetry failure; never retry application work. */ }
    },
    forceFlush: async () => { await Promise.allSettled([...pending]); },
    shutdown: async () => { state.traces.clear(); state.installed = false; },
  };
}
