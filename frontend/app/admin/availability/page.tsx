import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/server";
import { summarizeApiAvailability } from "@/modules/logging/availability-dashboard";
import { loadApiAvailability } from "@/modules/logging/dashboard-server";

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
    <main className="min-h-screen bg-gray-100 p-6 text-gray-900">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-xl bg-white p-6 shadow">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">API availability dashboard</h1>
              <p className="mt-2 text-sm text-gray-600">
                Request-based availability for instrumented API endpoints.
                The figures use recorded HTTP responses, not continuous uptime probes.
              </p>
            </div>
            <div className="flex flex-wrap gap-4 text-sm font-semibold">
              <Link href="/admin/errors" className="text-blue-700 hover:underline">
                Error dashboard
              </Link>
              <Link href="/admin" className="text-blue-700 hover:underline">
                Administration
              </Link>
            </div>
          </div>
        </header>

        <section aria-label="Availability by period" className="grid gap-4 md:grid-cols-3">
          {periods.map((period) => (
            <Link
              key={period.id}
              href={`/admin/availability?range=${period.id}`}
              aria-current={range === period.id ? "page" : undefined}
              className={`rounded-xl border p-5 shadow-sm transition-colors ${
                range === period.id
                  ? "border-blue-600 bg-blue-50"
                  : "border-gray-200 bg-white hover:border-blue-300"
              }`}
            >
              <h2 className="text-sm font-semibold text-gray-600">{period.label}</h2>
              <p className="mt-2 text-3xl font-bold">
                {displayPercent(period.summary.availability_percent)}
              </p>
              <p className="mt-2 text-sm text-gray-600">
                {numberFormat.format(period.summary.total_requests)} recorded requests
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {numberFormat.format(period.summary.server_errors)} server errors (5xx)
              </p>
            </Link>
          ))}
        </section>

        <section className="rounded-xl bg-white p-5 shadow">
          <h2 className="text-lg font-bold">{selected.label} summary</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Total requests", selected.summary.total_requests],
              ["Successful responses", selected.summary.successful_requests],
              ["Client errors (4xx)", selected.summary.client_errors],
              ["Server errors (5xx)", selected.summary.server_errors],
            ].map(([label, count]) => (
              <div key={label} className="rounded-lg bg-gray-50 p-4">
                <p className="text-sm text-gray-600">{label}</p>
                <p className="mt-2 text-2xl font-bold">
                  {numberFormat.format(count as number)}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-gray-600">
            Availability = (total requests - HTTP 5xx responses) / total requests.
            Client errors (4xx) count as available responses. No requests means no
            availability percentage, rather than 100% uptime.
          </p>
        </section>

        <section className="overflow-hidden rounded-xl bg-white shadow">
          <div className="border-b border-gray-200 p-5">
            <h2 className="text-lg font-bold">Endpoint breakdown</h2>
            <p className="mt-1 text-sm text-gray-600">
              {selected.label}. Endpoints with more server failures appear first.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-600">
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
                  <tr key={`${row.method}:${row.endpoint}`} className="border-t border-gray-100">
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
            <p className="p-8 text-center text-sm text-gray-500">
              No API request metrics were recorded in this period.
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
