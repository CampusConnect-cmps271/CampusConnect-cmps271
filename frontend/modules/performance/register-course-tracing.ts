import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { registerOTel } from "@vercel/otel";
import { TraceIdRatioBasedSampler } from "@opentelemetry/sdk-trace-base";
import { courseTracingEnabled } from "@/lib/course-trace-config";
import { courseTraceState } from "./course-tracing";
import { createCourseSpanProcessor } from "./course-trace-processor";

export function registerCourseTracing() {
  const state = courseTraceState();
  if (!courseTracingEnabled() || state.installed) return;
  const raw = Number(process.env.COURSE_TRACE_SAMPLE_RATE ?? .1);
  const rate = Number.isFinite(raw) && raw > 0 && raw <= 1 ? raw : .1;
  registerOTel({
    serviceName: "campus-connect",
    // An explicit processor list omits the SDK's default "auto" exporters.
    // No automatic exporters or fetch capture. Persist only these sanitized,
    // sampled summaries after the request span ends, with a one-second bound.
    spanProcessors: [createCourseSpanProcessor(state, {
      persist: process.env.COURSE_TRACE_PERSIST_ENABLED === "false" ? undefined : async entry => {
        await createAdminClient().from("app_logs").insert({
          level: "info", source: "server", event: "performance.course_request",
          user_id: null, message: null, context: entry.context,
        }).abortSignal(AbortSignal.timeout(1000));
      },
    })],
    flushTimeoutMillis: 1500,
    traceSampler: new TraceIdRatioBasedSampler(rate),
    instrumentations: [], autoDetectResources: false, propagators: ["tracecontext"],
  });
  state.installed = true;
}
