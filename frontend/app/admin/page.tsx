import { requireRole } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import RoleManager, { type ManagedUser } from "./role-manager";
import { ADMIN_CARD, AdminPageShell } from "@/components/AdminPageShell";

export default async function AdminRolesPage() {
  await requireRole(["administrator"]);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_users", {
    search_term: null,
  });

  if (error) throw new Error(`Could not load users: ${error.message}`);

  return (
    <AdminPageShell title="User roles" description="Administrator-only role assignment with protected permissions and audit history." maxWidth="max-w-5xl">
      <section className={ADMIN_CARD}>
        <RoleManager users={(data ?? []) as ManagedUser[]} />
      </section>
    </AdminPageShell>
  );
}
