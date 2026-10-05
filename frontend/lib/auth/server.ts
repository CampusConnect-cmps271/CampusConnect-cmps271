import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAppRole, type AppRole } from "./roles";

export async function getCurrentUserAndRole() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, role: null as AppRole | null };

  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw new Error(`Could not load user role: ${error.message}`);

  return { user, role: isAppRole(data?.role) ? data.role : null };
}

export async function requireRole(allowedRoles: readonly AppRole[]) {
  const session = await getCurrentUserAndRole();

  if (!session.user || !session.role || !allowedRoles.includes(session.role)) {
    redirect("/");
  }

  return session;
}
