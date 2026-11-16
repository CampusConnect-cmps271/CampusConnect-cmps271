import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const percentile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * fraction) - 1)] ?? 0;
const preferences = { interests: [], academic_goals: "", preferred_workload: "moderate", completed_course_codes: [], offering_preferences: { semester_id: "202720", attributes: ["Culture and History"] } };
const scenarios = [
  { path: "/api/notifications", method: "GET", valid: body => Array.isArray(body.items) },
  { path: "/api/messages/unread-count", method: "GET", valid: body => Number.isInteger(body.count) && body.count >= 0 },
  { path: "/api/electives/recommendations", method: "POST", body: preferences, valid: body => Array.isArray(body.recommendations) && body.recommendations.length > 0 },
];

/** Closed-loop bounded concurrency, full-body client latency, no write endpoints.
 * Loopback only: deliberately refuses accidental production load.
 * Cookie must belong to a disposable test account. Never prints it.
 */
export async function runLoad({ baseURL, cookie, requests = 90, concurrencies = [1, 5, 15], p95BudgetMs = 2000 }) {
  const url = new URL(baseURL);
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Use an HTTP loopback origin only.");
  if (!cookie || /[\r\n]/.test(cookie)) throw new Error("Provide a disposable test session cookie.");
  if (!Number.isInteger(requests) || requests < 3 || requests > 10_000 || !concurrencies.length || concurrencies.length > 5 || concurrencies.some(c => !Number.isInteger(c) || c < 1 || c > 50) || !Number.isFinite(p95BudgetMs) || p95BudgetMs <= 0) throw new Error("Invalid bounded load settings.");
  async function request(scenario) {
    const start = performance.now();
    try {
      const response = await fetch(new URL(scenario.path, url), { method: scenario.method, headers: { cookie, origin: url.origin, "content-type": "application/json" }, body: scenario.body ? JSON.stringify(scenario.body) : undefined, signal: AbortSignal.timeout(15_000), redirect: "manual" });
      const body = await response.json();
      return { path: scenario.path, ms: performance.now() - start, ok: response.status === 200 && scenario.valid(body), status: response.status };
    } catch { return { path: scenario.path, ms: performance.now() - start, ok: false, status: 0 }; }
  }
  // Compilation/cache warmup is separate, and cannot hide authentication errors.
  for (const scenario of scenarios) if (!(await request(scenario)).ok) throw new Error(`Warmup failed: ${scenario.path} (requires an authenticated fixture session and imported semester)`);
  const results = [];
  for (const concurrency of concurrencies) {
    const samples = []; let next = 0; const started = performance.now();
    await Promise.all(Array.from({ length: concurrency }, async () => {
      while (next < requests) { const index = next++; samples.push(await request(scenarios[index % scenarios.length])); }
    }));
    const elapsed = performance.now() - started;
    for (const scenario of scenarios) {
      const subset = samples.filter(s => s.path === scenario.path), times = subset.map(s => s.ms);
      const p95 = percentile(times, .95), failures = subset.filter(s => !s.ok).length;
      results.push({ concurrency, endpoint: scenario.path, requests: subset.length, failures, p50Ms: +percentile(times, .5).toFixed(1), p95Ms: +p95.toFixed(1), maxMs: +Math.max(...times).toFixed(1), passed: failures === 0 && p95 <= p95BudgetMs });
    }
    console.log(`Concurrency ${concurrency}: ${samples.length} requests, ${(samples.length / elapsed * 1000).toFixed(1)} requests/sec across all endpoints`);
  }
  console.table(results);
  return { environment: "Loopback app; warm cache; closed-loop concurrency; full JSON response latency", p95BudgetMs, results, passed: results.every(r => r.passed) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const cookie = await readFile(process.env.LOAD_COOKIE_FILE ?? "", "utf8");
    const report = await runLoad({ baseURL: process.env.LOAD_BASE_URL ?? "http://127.0.0.1:3200", cookie: cookie.trim(), requests: Number(process.env.LOAD_REQUESTS ?? 90), concurrencies: (process.env.LOAD_CONCURRENCIES ?? "1,5,15").split(",").map(Number), p95BudgetMs: Number(process.env.LOAD_P95_BUDGET_MS ?? 2000) });
    if (!report.passed) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
