import Link from "next/link";
import { requireRole } from "@/lib/auth/server";
import {
  groupErrorLogs,
  loadRecentErrors,
} from "@/modules/logging";

const RANGE_HOURS = { "24h": 24, "7d": 24 * 7, "14d": 24 * 14 } as const;
type Range = keyof typeof RANGE_HOURS;

function selectedRange(value: string | string[] | undefined): Range {
  return typeof value === "string" && value in RANGE_HOURS
    ? (value as Range)
    : "24h";
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

export default async function ErrorDashboardPage({
  searchParams,
}: PageProps<"/admin/errors">) {
  await requireRole(["administrator"]);
  const range = selectedRange((await searchParams).range);
  const rows = await loadRecentErrors(RANGE_HOURS[range]);
  const groups = groupErrorLogs(rows);
  const serverCount = rows.filter((row) => row.source === "server").length;
  const clientCount = rows.length - serverCount;

  return (
    <main className="min-h-screen bg-gray-100 p-6 text-gray-900">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-xl bg-white p-6 shadow">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">Error dashboard</h1>
              <p className="mt-2 text-sm text-gray-600">
                Recent redacted application errors, grouped for triage. Times are UTC.
              </p>
            </div>
            <Link href="/admin" className="font-semibold text-blue-700 hover:underline">
              Manage roles
            </Link>
          </div>
          <nav className="mt-5 flex gap-2" aria-label="Dashboard time range">
            {Object.keys(RANGE_HOURS).map((option) => (
              <Link
                key={option}
                href={`/admin/errors?range=${option}`}
                className={`rounded-md px-3 py-2 text-sm font-semibold ${
                  range === option
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {option}
              </Link>
            ))}
          </nav>
        </header>

        <section className="grid gap-4 sm:grid-cols-3">
          {[
            ["Total errors", rows.length],
            ["Backend", serverCount],
            ["Frontend", clientCount],
          ].map(([label, value]) => (
            <article key={label} className="rounded-xl bg-white p-5 shadow">
              <p className="text-sm font-medium text-gray-500">{label}</p>
              <p className="mt-2 text-3xl font-bold">{value}</p>
            </article>
          ))}
        </section>

        <section className="overflow-hidden rounded-xl bg-white shadow">
          <div className="border-b border-gray-200 p-5">
            <h2 className="text-lg font-bold">Grouped errors</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-5 py-3">Event</th>
                  <th className="px-5 py-3">Source</th>
                  <th className="px-5 py-3">Count</th>
                  <th className="px-5 py-3">Accounts</th>
                  <th className="px-5 py-3">Last seen</th>
                  <th className="px-5 py-3">Sample</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={group.key} className="border-t border-gray-100 align-top">
                    <td className="px-5 py-4 font-mono text-xs">{group.event}</td>
                    <td className="px-5 py-4">{group.source}</td>
                    <td className="px-5 py-4 font-semibold">{group.count}</td>
                    <td className="px-5 py-4">{group.affectedAccounts}</td>
                    <td className="whitespace-nowrap px-5 py-4">
                      {formatTimestamp(group.lastSeen)}
                    </td>
                    <td className="max-w-sm px-5 py-4 text-gray-600">
                      <span className="block truncate">
                        {group.sampleMessage ?? "No message"}
                      </span>
                      {group.samplePath ? (
                        <span className="mt-1 block truncate font-mono text-xs">
                          {group.samplePath}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {groups.length === 0 ? (
            <p className="p-8 text-center text-gray-500">
              No errors were recorded in this range.
            </p>
          ) : null}
        </section>

        <section className="rounded-xl bg-white p-5 shadow">
          <h2 className="text-lg font-bold">Recent samples</h2>
          <div className="mt-4 space-y-3">
            {rows.slice(0, 20).map((row) => (
              <details key={row.id} className="rounded-md border border-gray-200 p-4">
                <summary className="cursor-pointer font-medium">
                  {row.event} · {formatTimestamp(row.created_at)}
                </summary>
                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="font-semibold text-gray-600">Account ID</dt>
                    <dd className="break-all font-mono text-xs">
                      {row.user_id ?? "anonymous"}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-gray-600">Message</dt>
                    <dd>{row.message ?? "None"}</dd>
                  </div>
                </dl>
                <pre className="mt-3 overflow-x-auto rounded bg-gray-950 p-3 text-xs text-gray-100">
                  {JSON.stringify(row.context ?? {}, null, 2)}
                </pre>
              </details>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
