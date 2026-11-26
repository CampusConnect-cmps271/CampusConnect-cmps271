import Link from "next/link";
import { requireRole } from "@/lib/auth/server";
import { loadPerformance } from "@/modules/performance/server";
import { ADMIN_CARD, AdminEmptyState, AdminPageShell } from "@/components/AdminPageShell";

const ranges = { "1h": 1, "24h": 24, "7d": 168 } as const;
const ms = (value: number) => `${value.toFixed(1)} ms`;
export default async function PerformancePage({ searchParams }: PageProps<"/admin/performance">) {
  await requireRole(["administrator"]);
  const selected = (await searchParams).range;
  const range = typeof selected === "string" && Object.hasOwn(ranges, selected) ? selected as keyof typeof ranges : "24h";
  const metrics = await loadPerformance(ranges[range]);
  return <AdminPageShell title="Performance dashboard" description="API response-time percentiles and Supabase HTTP timing anomalies, available only to administrators.">
      <nav className={`${ADMIN_CARD} flex flex-wrap gap-2`} aria-label="Performance time range">{Object.keys(ranges).map(r => <Link key={r} href={`/admin/performance?range=${r}`} aria-current={r === range ? "page" : undefined} className={`rounded-lg px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)] ${r === range ? "bg-[var(--maroon)] text-white" : "bg-[var(--maroon-50)] text-[var(--maroon)] hover:bg-[var(--maroon-100)]"}`}>{r}</Link>)}</nav>
      <section className={ADMIN_CARD}>
        <h2 className="text-lg font-bold">API response times</h2>
        <p className="my-3 text-sm leading-6 text-[var(--ink-soft)]">Latest {metrics.rows} metric events in this range{metrics.capped ? "; limit reached — older events are excluded" : ""}. Percentiles describe recorded requests, excluding proxy time and streamed body delivery. The error column includes 4xx and 5xx and must not be read as an outage count.</p>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-[var(--maroon-50)]"><tr>{["Endpoint", "Requests", "Errors", "Slow", "p50", "p95", "Maximum", "DB attempts", "DB time total"].map(h => <th scope="col" key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{metrics.endpoints.map(e => <tr key={`${e.method} ${e.endpoint}`} className="border-t border-[var(--border)]"><td className="p-3 font-mono">{e.method} {e.endpoint}</td>{[e.count, e.errors, e.slow, ms(e.p50), ms(e.p95), ms(e.max), e.databaseCalls, ms(e.databaseMs)].map((v, i) => <td key={i} className="p-3">{v}</td>)}</tr>)}</tbody></table></div>
        {!metrics.endpoints.length && <AdminEmptyState title="No API timings" detail="No performance measurements were recorded in this range." />}
      </section>
      <section className={ADMIN_CARD}>
        <h2 className="text-lg font-bold">Slow or failed database requests</h2>
        <p className="my-3 text-sm leading-6 text-[var(--ink-soft)]">Supabase HTTP attempts until response headers, including network time and SDK retries as separate attempts. This is not Postgres execution time. Concurrent database timings may overlap.</p>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-[var(--maroon-50)]"><tr>{["Operation", "Recorded anomalies", "Failures", "Maximum"].map(h => <th scope="col" key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{metrics.queries.map(q => <tr key={`${q.method} ${q.operation}`} className="border-t border-[var(--border)]"><td className="p-3 font-mono">{q.method} {q.operation}</td><td className="p-3">{q.count}</td><td className="p-3">{q.failures}</td><td className="p-3">{ms(q.max)}</td></tr>)}</tbody></table></div>
        {!metrics.queries.length && <AdminEmptyState title="No database anomalies" detail="No slow or failed Supabase requests were recorded in this range." />}
      </section>
  </AdminPageShell>;
}
