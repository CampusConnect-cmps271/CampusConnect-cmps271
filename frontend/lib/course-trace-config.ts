export const COURSE_REQUEST_ID_HEADER = "x-cc-request-id";

export function courseTracingEnabled(env = process.env) {
  return env.COURSE_TRACING_ENABLED !== "false" &&
    (env.VERCEL === "1" || env.COURSE_TRACING_ENABLED === "true");
}
