import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/server";
import { runHealthChecks, type ComponentHealth } from "@/modules/monitoring";
import { ADMIN_CARD, AdminPageShell } from "@/components/AdminPageShell";

export const metadata: Metadata = { title: "System health · CampusConnect" };
export const dynamic = "force-dynamic";

const statusStyles: Record<ComponentHealth, string> = {
  operational: "bg-emerald-100 text-emerald-800",
  degraded: "bg-amber-100 text-amber-800",
  outage: "bg-red-100 text-red-800",
};

export default async function AdminHealthPage() {
  await requireRole(["administrator"]);
  const snapshot = await runHealthChecks();
  const checkedAt = new Date(snapshot.checkedAt).toLocaleString("en", { timeZone: "UTC" });

  return (
    <AdminPageShell
      title="System health"
      description="Live, administrator-only checks for the website, Supabase database and AI services."
      maxWidth="max-w-6xl"
    >
      <section className={`${ADMIN_CARD} flex flex-wrap items-center justify-between gap-4`} aria-label="Overall system health">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--ink-soft)]">Overall status</p>
          <p className="mt-1 text-2xl font-bold capitalize text-[var(--ink)]">{snapshot.overall}</p>
        </div>
        <div className="text-sm text-[var(--ink-soft)]">
          <p>Checked {checkedAt} UTC</p>
          <a href="/admin/health" className="mt-1 inline-block font-semibold text-[var(--maroon)] hover:underline">Run checks again</a>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3" aria-label="Service health checks">
          {snapshot.checks.map((check) => (
            <article key={check.service} className={ADMIN_CARD}>
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-bold">{check.label}</h2>
                <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${statusStyles[check.status]}`}>
                  {check.status}
                </span>
              </div>
              <p className="mt-4 text-sm leading-6 text-[var(--ink-soft)]">{check.message}</p>
              <p className="mt-4 text-xs font-semibold text-[var(--ink-soft)]">Probe latency: {check.latencyMs} ms</p>
            </article>
          ))}
      </section>

      <aside className={`${ADMIN_CARD} text-sm leading-6 text-[var(--ink-soft)]`} aria-label="Health monitoring explanation">
        Scheduled probes are separate from request-based availability. A degraded optional AI service does not automatically mean the website is unavailable; database or website outages require operator attention.
      </aside>
    </AdminPageShell>
  );
}
