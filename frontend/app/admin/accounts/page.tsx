import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import AccountManager, { type ManagedAccount } from "./account-manager";

export const metadata: Metadata = { title: "Account management · CampusConnect" };

export default async function AdminAccountsPage() {
  await requireRole(["administrator"]);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_accounts", { search_term: null });

  if (error) throw new Error("Unable to load accounts.");

  return (
    <main className="min-h-screen bg-gray-100 p-6 text-gray-900">
      <div className="mx-auto max-w-4xl rounded-xl bg-white p-6 shadow">
        <Link href="/admin" className="text-sm font-semibold text-blue-700 hover:underline">← User roles</Link>
        <h1 className="mt-4 text-2xl font-bold">Account management</h1>
        <p className="mt-2 text-sm text-gray-600">Suspend accounts temporarily or indefinitely and lift active suspensions.</p>
        <AccountManager accounts={(data ?? []) as ManagedAccount[]} />
      </div>
    </main>
  );
}

