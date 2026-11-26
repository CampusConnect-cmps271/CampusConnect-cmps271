import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_CARD, ADMIN_FIELD, ADMIN_PRIMARY, AdminEmptyState, AdminPageShell } from "@/components/AdminPageShell";

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
    <AdminPageShell title="Audit log" description="Append-only history of protected role, suspension and moderation actions." maxWidth="max-w-6xl">
      <section className={ADMIN_CARD}>
        <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]" aria-label="Filter audit log">
          <label className="flex flex-col gap-1 text-sm font-semibold">Action<input name="action" defaultValue={action} placeholder="content.removed" className={ADMIN_FIELD} /></label>
          <label className="flex flex-col gap-1 text-sm font-semibold">Actor<input name="actor" defaultValue={actor} placeholder="Email or account ID" className={ADMIN_FIELD} /></label>
          <button className={`${ADMIN_PRIMARY} self-end`}>Apply filters</button>
        </form>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--maroon-50)]"><tr className="border-b border-[var(--border)]"><th scope="col" className="p-3">When</th><th scope="col" className="p-3">Actor</th><th scope="col" className="p-3">Action</th><th scope="col" className="p-3">Target</th><th scope="col" className="p-3">Reason</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-[var(--border)] align-top">
                  <td className="p-3 whitespace-nowrap">{new Date(row.created_at).toLocaleString()}</td>
                  <td className="p-3">{row.actor_email}</td>
                  <td className="p-3 font-mono text-xs">{row.action}</td>
                  <td className="p-3 font-mono text-xs">{row.target_type}{row.target_id ? ` · ${row.target_id}` : ""}</td>
                  <td className="p-3">{row.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? <div className="mt-5"><AdminEmptyState title="No matching audit actions" detail="Try removing one of the filters or search for another actor." /></div> : null}
        </div>
      </section>
    </AdminPageShell>
  );
}

