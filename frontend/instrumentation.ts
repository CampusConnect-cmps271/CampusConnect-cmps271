/**
 * Runs once when a server instance starts (SP1-13).
 *
 * Records that the app came up, and complains loudly if a required
 * environment variable is missing — the usual cause of a deployment that
 * builds fine and then fails on first request. Only the variable NAMES are
 * logged, never their values.
 *
 */

import type { Instrumentation } from "next";
import { ACCOUNT_ID_HEADER } from "@/lib/headers";
import {
  accountIdFromHeaders,
  describeError,
  pathnameOnly,
} from "@/modules/logging";

/**
 * Read with literal keys, not `process.env[name]`.
 *
 * Next only inlines literal `process.env.NEXT_PUBLIC_X` accesses at build
 * time, so a computed lookup reports "missing" on any host that supplies these
 * at build time but not in the runtime environment — a false alarm on a
 * perfectly good deployment.
 *
 * NEXT_PUBLIC_SITE_URL is deliberately absent: nothing reads it any more, now
 * that verification is by code rather than by emailed link. An alert for an
 * unused variable just teaches people to ignore the alert.
 */
const REQUIRED_ENV_VARS: ReadonlyArray<readonly [string, string | undefined]> = [
  ["NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL],
  [
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  ],
  ["SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY],
];

/**
 * Next waits for register() before the server accepts requests, so nothing in
 * here may block indefinitely. A failed write is already swallowed and printed,
 * but an unreachable database hangs rather than failing, which would hold up
 * startup. Give it a bounded window and move on.
 */
const STARTUP_LOG_TIMEOUT_MS = 3000;

function withTimeout(work: Promise<void>): Promise<void> {
  return Promise.race([
    work,
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, STARTUP_LOG_TIMEOUT_MS);
      // Do not keep the process alive just for this.
      timer.unref?.();
    }),
  ]);
}

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

  const missing = REQUIRED_ENV_VARS.filter(([, value]) => !value?.trim()).map(
    ([name]) => name,
  );

  await withTimeout(
    log.info("app.start", {
      environment: process.env.NODE_ENV,
      commit: commitSha(),
      runtime: process.env.NEXT_RUNTIME,
    }),
  );

  if (missing.length > 0) {
    await withTimeout(
      log.error(
        "app.start.missing_env",
        // Names only. Never the values.
        { missing },
        { message: `Missing required environment variables: ${missing.join(", ")}` },
      ),
    );
  }
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { buildEntry, persistEntry } = await import("@/modules/logging");
  const details = describeError(error);
  const userId = accountIdFromHeaders({
    [ACCOUNT_ID_HEADER]: request.headers[ACCOUNT_ID_HEADER],
  });
  const entry = buildEntry(
    "error",
    "backend.error.unexpected",
    {
      method: request.method,
      path: pathnameOnly(request.path),
      route: context.routePath,
      route_type: context.routeType,
      router: context.routerKind,
      render_source: context.renderSource,
      error_name: details.name,
      stack: details.stack,
      ...(details.digest ? { digest: details.digest } : {}),
    },
    { message: details.message, userId, source: "server" },
  );

  console.error(JSON.stringify({ ts: new Date().toISOString(), ...entry }));
  await persistEntry(entry);
};
