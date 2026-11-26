import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { once } from "node:events";
import { createServerClient } from "@supabase/ssr";
import { runLoad } from "./load-test.mjs";

// Use after a fixture-configured production build. No real keys or provider access.
// NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:3101 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test_only npm run build -- --webpack
const children = [];
const output = createWriteStream("/tmp/campusconnect-load-server.log", { mode: 0o600 });
function start(args, env = {}) {
  const child = spawn(process.execPath, args, { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.pipe(output, { end: false }); child.stderr.pipe(output, { end: false }); children.push(child); return child;
}
async function ready(url) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (children.some(child => child.exitCode !== null)) throw new Error("Fixture server exited; inspect /tmp/campusconnect-load-server.log");
    try { const response = await fetch(url, { signal: AbortSignal.timeout(1000), redirect: "manual" }); if (response.status < 500) return; } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error("Fixture startup timed out");
}
try {
  // Refuse to send fixture credentials to an unrelated service occupying the ports.
  for (const port of [3101, 3200]) {
    let occupied = false;
    try { await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(1000) }); occupied = true; } catch {}
    if (occupied) throw new Error(`Port ${port} already in use; stop that server first.`);
  }
  start(["tests/e2e/mock-supabase.mjs"]);
  start(["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3200"], {
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:3101", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_only", SUPABASE_SECRET_KEY: "sb_secret_test_only",
    UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "", RESIS_API_KEY: "", ELECTIVE_AI_API_KEY: "", OPENAI_API_KEY: "", ELECTIVE_AI_PROVIDER: "none", ELECTIVES_PROVIDER_TOKEN: "", GEMINI_API_KEY: "",
  });
  await ready("http://127.0.0.1:3101/health"); await ready("http://127.0.0.1:3200/login");
  const cookieJar = new Map();
  const client = createServerClient("http://127.0.0.1:3101", "sb_publishable_test_only", { cookies: { getAll: () => [...cookieJar].map(([name, value]) => ({ name, value })), setAll: values => values.forEach(c => cookieJar.set(c.name, c.value)) } });
  const { error } = await client.auth.signInWithPassword({ email: "recommendations-browse@mail.aub.edu", password: "test-verified-password" });
  if (error) throw new Error("Fixture login failed");
  const cookie = [...cookieJar].map(([name, value]) => `${name}=${value}`).join("; ");
  console.log("Production Next.js build with synthetic local Supabase fixtures; no AI, Redis or Resis requests. This does not measure production database capacity.");
  const report = await runLoad({ baseURL: "http://127.0.0.1:3200", cookie, requests: Number(process.env.LOAD_REQUESTS ?? 90) });
  if (!report.passed) process.exitCode = 1;
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally {
  await Promise.all(children.map(async child => { if (child.exitCode !== null) return; child.kill("SIGTERM"); await Promise.race([once(child, "exit"), new Promise(r => setTimeout(() => { child.kill("SIGKILL"); r(); }, 3000).unref())]); }));
  output.end();
}
