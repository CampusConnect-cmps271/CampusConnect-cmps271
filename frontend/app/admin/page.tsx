import Link from "next/link";
import { requireRole } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import RoleManager, { type ManagedUser } from "./role-manager";

export default async function AdminRolesPage() {
  await requireRole(["administrator"]);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_users", {
    search_term: null,
  });

  if (error) throw new Error(`Could not load users: ${error.message}`);

  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <div className="mx-auto max-w-5xl rounded-xl bg-white p-6 shadow">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h1 className="text-2xl font-bold text-gray-900">User roles</h1>
          <Link
            href="/admin/errors"
            className="font-semibold text-blue-700 hover:underline"
          >
            View error dashboard
          </Link>
        </div>
        <p className="mt-2 text-sm text-gray-600">
          Administrator-only role assignment for CampusConnect.
        </p>
        <RoleManager users={(data ?? []) as ManagedUser[]} />
      </div>
    </main>
  );
}
