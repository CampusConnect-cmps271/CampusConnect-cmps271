import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/server";
import { runHealthChecks, type ComponentHealth } from "@/modules/monitoring";

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

  return (
    <main className="min-h-screen bg-gray-100 p-6 text-gray-900">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-xl bg-white p-6 shadow">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Link href="/admin" className="text-sm font-semibold text-blue-700 hover:underline">
                ← Administration
              </Link>
              <h1 className="mt-4 text-2xl font-bold">System health</h1>
              <p className="mt-2 text-sm text-gray-600">
                Live checks for the website, Supabase database and Gemini services.
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Overall</p>
              <p className="mt-1 text-xl font-bold capitalize">{snapshot.overall}</p>
              <Link href="/admin/health" className="mt-3 inline-block text-sm font-semibold text-blue-700 hover:underline">
                Refresh checks
              </Link>
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3" aria-label="Service health checks">
          {snapshot.checks.map((check) => (
            <article key={check.service} className="rounded-xl bg-white p-5 shadow">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-bold">{check.label}</h2>
                <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${statusStyles[check.status]}`}>
                  {check.status}
                </span>
              </div>
              <p className="mt-4 text-sm text-gray-600">{check.message}</p>
              <p className="mt-4 text-xs font-medium text-gray-500">{check.latencyMs} ms</p>
            </article>
          ))}
        </section>

        <footer className="rounded-xl bg-white p-5 text-sm text-gray-600 shadow">
          Checked at {new Date(snapshot.checkedAt).toLocaleString("en", { timeZone: "UTC" })} UTC.
          Scheduled probes run daily and alert only on degraded or unavailable services.
        </footer>
      </div>
    </main>
  );
}
