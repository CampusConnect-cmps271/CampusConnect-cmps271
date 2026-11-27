import "server-only";
import { context, trace } from "@opentelemetry/api";
import { performance } from "node:perf_hooks";

export const COURSE_PHASES = ["page_auth", "jwt_verification", "live_session", "catalogue_load", "catalogue_cache", "catalogue_rpc", "ratings_load"] as const;
export type CoursePhase = typeof COURSE_PHASES[number];
export type PhaseTiming = { calls: number; total_ms: number; max_ms: number };
export type CourseTrace = { rootId: string; startedAt: number; requestId?: string; phases: Record<string, PhaseTiming> };
export type CourseTraceState = { installed: boolean; traces: Map<string, CourseTrace>; registeredAt: number };
const stateKey = Symbol.for("campus-connect.course-tracing.v1");
const globals = globalThis as unknown as Record<symbol, CourseTraceState | undefined>;
export function courseTraceState(): CourseTraceState {
  return globals[stateKey] ??= { installed: false, traces: new Map(), registeredAt: performance.now() };
}
const requestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function attachCourseRequestId(value: string | null) {
  const span = trace.getActiveSpan();
  if (!value || !requestIdPattern.test(value) || !span) return;
  const current = courseTraceState().traces.get(span.spanContext().traceId);
  if (current) current.requestId = value;
}

/** Observational only. Runs work once; preserves auth redirects and errors. */
export async function traceCoursePhase<T>(phase: CoursePhase, work: () => Promise<T>): Promise<T> {
  const active = trace.getActiveSpan();
  const state = courseTraceState();
  if (!state.installed || !active || !state.traces.has(active.spanContext().traceId)) return work();
  let span;
  try { span = trace.getTracer("campus-connect-course").startSpan("course.phase", { attributes: { "cc.phase": phase } }); }
  catch { return work(); }
  const scoped = trace.setSpan(context.active(), span);
  return context.with(scoped, async () => {
    try { return await work(); }
    finally { try { span.end(); } catch { /* Diagnostics cannot change work. */ } }
  });
}

export function addPhase(current: CourseTrace, phase: string, durationMs: number) {
  if (!Number.isFinite(durationMs) || durationMs < 0 || durationMs > 3_600_000) return;
  const previous = current.phases[phase] ?? { calls: 0, total_ms: 0, max_ms: 0 };
  current.phases[phase] = { calls: previous.calls + 1, total_ms: previous.total_ms + durationMs, max_ms: Math.max(previous.max_ms, durationMs) };
}
