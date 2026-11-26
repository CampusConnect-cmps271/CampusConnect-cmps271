import Link from "next/link";
import { requireRole } from "@/lib/auth/server";
import {
  groupErrorLogs,
  loadRecentErrors,
} from "@/modules/logging";
import { ADMIN_CARD, AdminEmptyState, AdminPageShell } from "@/components/AdminPageShell";

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
    <AdminPageShell title="Error dashboard" description="Recent redacted frontend and backend errors, grouped for administrator triage. All timestamps use UTC.">
          <nav className={`${ADMIN_CARD} flex gap-2`} aria-label="Dashboard time range">
            {Object.keys(RANGE_HOURS).map((option) => (
              <Link
                key={option}
                href={`/admin/errors?range=${option}`}
                className={`rounded-md px-3 py-2 text-sm font-semibold ${
                  range === option
                    ? "bg-[var(--maroon)] text-white"
                    : "bg-[var(--maroon-50)] text-[var(--ink)] hover:bg-[var(--maroon-100)]"
                }`}
              >
                {option}
              </Link>
            ))}
          </nav>

        <section className="grid gap-4 sm:grid-cols-3">
          {[
            ["Total errors", rows.length],
            ["Backend", serverCount],
            ["Frontend", clientCount],
          ].map(([label, value]) => (
            <article key={label} className={ADMIN_CARD}>
              <p className="text-sm font-medium text-[var(--ink-soft)]">{label}</p>
              <p className="mt-2 text-3xl font-bold">{value}</p>
            </article>
          ))}
        </section>

        <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-[var(--shadow-sm)]">
          <div className="border-b border-[var(--border)] p-5">
            <h2 className="text-lg font-bold">Grouped errors</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--maroon-50)] text-[var(--ink-soft)]">
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
                  <tr key={group.key} className="border-t border-[var(--border)] align-top">
                    <td className="px-5 py-4 font-mono text-xs">{group.event}</td>
                    <td className="px-5 py-4">{group.source}</td>
                    <td className="px-5 py-4 font-semibold">{group.count}</td>
                    <td className="px-5 py-4">{group.affectedAccounts}</td>
                    <td className="whitespace-nowrap px-5 py-4">
                      {formatTimestamp(group.lastSeen)}
                    </td>
                    <td className="max-w-sm px-5 py-4 text-[var(--ink-soft)]">
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
            <div className="p-5"><AdminEmptyState title="No recorded errors" detail="No frontend or backend errors were recorded in this time range." /></div>
          ) : null}
        </section>

        <section className={ADMIN_CARD}>
          <h2 className="text-lg font-bold">Recent samples</h2>
          <div className="mt-4 space-y-3">
            {rows.slice(0, 20).map((row) => (
              <details key={row.id} className="rounded-lg border border-[var(--border)] p-4">
                <summary className="cursor-pointer font-medium">
                  {row.event} · {formatTimestamp(row.created_at)}
                </summary>
                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="font-semibold text-[var(--ink-soft)]">Account ID</dt>
                    <dd className="break-all font-mono text-xs">
                      {row.user_id ?? "anonymous"}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-[var(--ink-soft)]">Message</dt>
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
    </AdminPageShell>
  );
}
