import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/server";
import { summarizeApiAvailability } from "@/modules/logging/availability-dashboard";
import { loadApiAvailability } from "@/modules/logging/dashboard-server";
import { ADMIN_CARD, AdminEmptyState, AdminPageShell } from "@/components/AdminPageShell";

export const metadata: Metadata = {
  title: "API availability | CampusConnect",
};

const PERIODS = [
  { id: "24h", label: "Last 24 hours", hours: 24 },
  { id: "7d", label: "Last 7 days", hours: 24 * 7 },
  { id: "30d", label: "Last 30 days", hours: 24 * 30 },
] as const;

type PeriodId = (typeof PERIODS)[number]["id"];

function selectedPeriod(value: string | string[] | undefined): PeriodId {
  return PERIODS.find((period) => period.id === value)?.id ?? "24h";
}

function displayPercent(percent: number | null): string {
  return percent === null ? "No data" : `${percent.toFixed(2)}%`;
}

const numberFormat = new Intl.NumberFormat("en-US");

export default async function AvailabilityDashboardPage({
  searchParams,
}: PageProps<"/admin/availability">) {
  await requireRole(["administrator"]);

  const range = selectedPeriod((await searchParams).range);
  const periods = await Promise.all(
    PERIODS.map(async (period) => {
      const rows = await loadApiAvailability(period.hours);
      return { ...period, rows, summary: summarizeApiAvailability(rows) };
    }),
  );

  const selected = periods.find((period) => period.id === range) ?? periods[0];
  const endpointRows = [...selected.rows].sort(
    (a, b) =>
      b.server_errors - a.server_errors ||
      a.endpoint.localeCompare(b.endpoint) ||
      a.method.localeCompare(b.method),
  );

  return (
    <AdminPageShell
      title="API availability"
      description="Request-based service indicators for instrumented endpoints. These figures are not continuous uptime probes."
    >
        <section aria-label="Availability by period" className="grid gap-4 md:grid-cols-3">
          {periods.map((period) => (
            <Link
              key={period.id}
              href={`/admin/availability?range=${period.id}`}
              aria-current={range === period.id ? "page" : undefined}
              className={`rounded-xl border p-5 shadow-sm transition-colors ${
                range === period.id
                  ? "border-[var(--maroon)] bg-[var(--maroon-50)] ring-2 ring-[var(--maroon-100)]"
                  : "border-[var(--border)] bg-white hover:border-[var(--maroon-200)]"
              }`}
            >
              <h2 className="text-sm font-semibold text-[var(--ink-soft)]">{period.label}</h2>
              <p className="mt-2 text-3xl font-bold">
                {displayPercent(period.summary.availability_percent)}
              </p>
              <p className="mt-2 text-sm text-[var(--ink-soft)]">
                {numberFormat.format(period.summary.total_requests)} recorded requests
              </p>
              <p className="mt-1 text-xs text-[var(--ink-soft)]">
                {numberFormat.format(period.summary.server_errors)} server errors (5xx)
              </p>
            </Link>
          ))}
        </section>

        <section className={ADMIN_CARD}>
          <h2 className="text-lg font-bold">{selected.label} summary</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Total requests", selected.summary.total_requests],
              ["Successful responses", selected.summary.successful_requests],
              ["Client errors (4xx)", selected.summary.client_errors],
              ["Server errors (5xx)", selected.summary.server_errors],
            ].map(([label, count]) => (
              <div key={label} className="rounded-xl bg-[var(--maroon-50)] p-4">
                <p className="text-sm text-[var(--ink-soft)]">{label}</p>
                <p className="mt-2 text-2xl font-bold">
                  {numberFormat.format(count as number)}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--yellow-50)] p-4 text-sm leading-6 text-[var(--ink-soft)]">
            Availability = (total requests - HTTP 5xx responses) / total requests.
            Client errors (4xx) count as available responses. No requests means no
            availability percentage, rather than 100% uptime.
          </p>
        </section>

        <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-[var(--shadow-sm)]">
          <div className="border-b border-[var(--border)] p-5">
            <h2 className="text-lg font-bold">Endpoint breakdown</h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              {selected.label}. Endpoints with more server failures appear first.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--maroon-50)] text-[var(--ink-soft)]">
                <tr>
                  <th scope="col" className="px-5 py-3">Method</th>
                  <th scope="col" className="px-5 py-3">Endpoint</th>
                  <th scope="col" className="px-5 py-3 text-right">Requests</th>
                  <th scope="col" className="px-5 py-3 text-right">4xx</th>
                  <th scope="col" className="px-5 py-3 text-right">5xx</th>
                  <th scope="col" className="px-5 py-3 text-right">Availability</th>
                </tr>
              </thead>
              <tbody>
                {endpointRows.map((row) => (
                  <tr key={`${row.method}:${row.endpoint}`} className="border-t border-[var(--border)]">
                    <td className="px-5 py-4 font-semibold">{row.method}</td>
                    <td className="px-5 py-4 font-mono text-xs">{row.endpoint}</td>
                    <td className="px-5 py-4 text-right">{numberFormat.format(row.total_requests)}</td>
                    <td className="px-5 py-4 text-right">{numberFormat.format(row.client_errors)}</td>
                    <td className="px-5 py-4 text-right">{numberFormat.format(row.server_errors)}</td>
                    <td className="px-5 py-4 text-right font-semibold">
                      {displayPercent(row.availability_percent)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {endpointRows.length === 0 ? (
            <div className="p-5"><AdminEmptyState title="No availability data" detail="No instrumented API requests were recorded in this period. Select a longer range or run a synthetic check." /></div>
          ) : null}
        </section>
    </AdminPageShell>
  );
}
