import Link from "next/link";
import { requireRole } from "@/lib/auth/server";
import { loadPerformance } from "@/modules/performance/server";

const ranges = { "1h": 1, "24h": 24, "7d": 168 } as const;
const ms = (value: number) => `${value.toFixed(1)} ms`;
export default async function PerformancePage({ searchParams }: PageProps<"/admin/performance">) {
  await requireRole(["administrator"]);
  const selected = (await searchParams).range;
  const range = typeof selected === "string" && Object.hasOwn(ranges, selected) ? selected as keyof typeof ranges : "24h";
  const metrics = await loadPerformance(ranges[range]);
  return <main className="min-h-screen bg-gray-100 p-6 text-gray-900">
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="rounded-xl bg-white p-6 shadow">
        <h1 className="text-2xl font-bold">Performance dashboard</h1>
        <p className="mt-2 text-sm text-gray-600">API handler response times and database HTTP timings. Refresh to see new measurements.</p>
        <nav className="mt-4 flex flex-wrap gap-4 text-sm" aria-label="Performance time range">{Object.keys(ranges).map(r => <Link key={r} href={`/admin/performance?range=${r}`} aria-current={r === range ? "page" : undefined} className="font-semibold text-blue-700 underline">{r}</Link>)}<Link href="/admin">Admin home</Link><Link href="/admin/errors">Error dashboard</Link></nav>
      </header>
      <section className="rounded-xl bg-white p-6 shadow">
        <h2 className="text-lg font-bold">API response times</h2>
        <p className="my-3 text-sm text-gray-600">Latest {metrics.rows} metric events in this range{metrics.capped ? "; limit reached — older events are excluded" : ""}. Percentiles describe these recorded requests, excluding proxy time and streamed body delivery. Errors include HTTP 4xx and 5xx.</p>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Endpoint", "Requests", "Errors", "Slow", "p50", "p95", "Maximum", "DB attempts", "DB time total"].map(h => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{metrics.endpoints.map(e => <tr key={`${e.method} ${e.endpoint}`} className="border-t border-gray-200"><td className="p-3 font-mono">{e.method} {e.endpoint}</td>{[e.count, e.errors, e.slow, ms(e.p50), ms(e.p95), ms(e.max), e.databaseCalls, ms(e.databaseMs)].map((v, i) => <td key={i} className="p-3">{v}</td>)}</tr>)}</tbody></table></div>
        {!metrics.endpoints.length && <p className="py-5">No API measurements recorded in this range.</p>}
      </section>
      <section className="rounded-xl bg-white p-6 shadow">
        <h2 className="text-lg font-bold">Slow or failed database requests</h2>
        <p className="my-3 text-sm text-gray-600">Supabase HTTP attempts until response headers, including network time and SDK retries as separate attempts. This is not Postgres execution time. API events keep at most five slow or failed operations; outside API handlers, anomaly logging is capped at 30 events per process per minute. Concurrent DB times may overlap.</p>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Operation", "Recorded anomalies", "Failures", "Maximum"].map(h => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{metrics.queries.map(q => <tr key={`${q.method} ${q.operation}`} className="border-t border-gray-200"><td className="p-3 font-mono">{q.method} {q.operation}</td><td className="p-3">{q.count}</td><td className="p-3">{q.failures}</td><td className="p-3">{ms(q.max)}</td></tr>)}</tbody></table></div>
        {!metrics.queries.length && <p className="py-5">No slow or failed database requests recorded in this range.</p>}
      </section>
    </div>
  </main>;
}
