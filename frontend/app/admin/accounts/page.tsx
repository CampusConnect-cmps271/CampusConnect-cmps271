import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import AccountManager, { type ManagedAccount } from "./account-manager";
import { ADMIN_CARD, AdminPageShell } from "@/components/AdminPageShell";

export const metadata: Metadata = { title: "Account management · CampusConnect" };

export default async function AdminAccountsPage() {
  await requireRole(["administrator"]);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_accounts", { search_term: null });

  if (error) throw new Error("Unable to load accounts.");

  return (
    <AdminPageShell title="Account management" description="Suspend accounts safely, review the active restriction and restore access with an auditable reason." maxWidth="max-w-4xl">
      <section className={ADMIN_CARD}>
        <AccountManager accounts={(data ?? []) as ManagedAccount[]} />
      </section>
    </AdminPageShell>
  );
}

