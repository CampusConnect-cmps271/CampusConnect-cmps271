/**
 * Runs once when a server instance starts (SP1-13).
 *
 * Records that the app came up, and complains loudly if a required
 * environment variable is missing — the usual cause of a deployment that
 * builds fine and then fails on first request. Only the variable NAMES are
 * logged, never their values.
 *
 * onRequestError is deliberately not implemented here: per-request error
 * tracking is SCRUM-25 (Housari).
 */

const REQUIRED_ENV_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "NEXT_PUBLIC_SITE_URL",
];

/** Whatever the host exposes; absent when running locally from a clone. */
function commitSha(): string | null {
  const candidates = [
    process.env.VERCEL_GIT_COMMIT_SHA,
    process.env.GIT_COMMIT_SHA,
    process.env.GITHUB_SHA,
  ];

  return candidates.find((value) => Boolean(value?.trim()))?.trim() ?? null;
}

export async function register(): Promise<void> {
  // Edge and browser instrumentation share this file; the logger needs Node.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { log } = await import("@/modules/logging");

  const missing = REQUIRED_ENV_VARS.filter(
    (name) => !process.env[name]?.trim(),
  );

  await log.info("app.start", {
    environment: process.env.NODE_ENV,
    commit: commitSha(),
    runtime: process.env.NEXT_RUNTIME,
  });

  if (missing.length > 0) {
    await log.error(
      "app.start.missing_env",
      // Names only. Never the values.
      { missing },
      { message: `Missing required environment variables: ${missing.join(", ")}` },
    );
  }
}
