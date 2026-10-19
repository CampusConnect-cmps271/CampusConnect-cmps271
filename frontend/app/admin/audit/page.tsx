import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Audit log · CampusConnect" };

type AuditRow = {
  id: number;
  actor_id: string;
  actor_email: string;
  action: string;
  target_type: string;
  target_id: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export default async function AuditLogPage({ searchParams }: PageProps<"/admin/audit">) {
  await requireRole(["administrator"]);
  const query = await searchParams;
  const action = typeof query.action === "string" ? query.action.slice(0, 100) : "";
  const actor = typeof query.actor === "string" ? query.actor.slice(0, 200) : "";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_audit_log", {
    action_filter: action || null,
    actor_filter: actor || null,
    row_limit: 100,
  });

  if (error) throw new Error("Unable to load the audit log.");
  const rows = (data ?? []) as AuditRow[];

  return (
    <main className="min-h-screen bg-gray-100 p-6 text-gray-900">
      <div className="mx-auto max-w-6xl rounded-xl bg-white p-6 shadow">
        <Link href="/admin" className="text-sm font-semibold text-blue-700 hover:underline">← User roles</Link>
        <h1 className="mt-4 text-2xl font-bold">Audit log</h1>
        <p className="mt-2 text-sm text-gray-600">Append-only history of role, suspension, and moderation actions.</p>

        <form className="mt-6 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <input name="action" defaultValue={action} placeholder="Action, e.g. content.removed" className="rounded-md border px-3 py-2" />
          <input name="actor" defaultValue={actor} placeholder="Actor email or ID" className="rounded-md border px-3 py-2" />
          <button className="rounded-md bg-blue-700 px-4 py-2 font-semibold text-white">Filter</button>
        </form>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b"><th className="p-3">When</th><th className="p-3">Actor</th><th className="p-3">Action</th><th className="p-3">Target</th><th className="p-3">Reason</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b align-top">
                  <td className="p-3 whitespace-nowrap">{new Date(row.created_at).toLocaleString()}</td>
                  <td className="p-3">{row.actor_email}</td>
                  <td className="p-3 font-mono text-xs">{row.action}</td>
                  <td className="p-3 font-mono text-xs">{row.target_type}{row.target_id ? ` · ${row.target_id}` : ""}</td>
                  <td className="p-3">{row.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? <p className="py-8 text-center text-sm text-gray-500">No matching actions.</p> : null}
        </div>
      </div>
    </main>
  );
}

