import type { ReactNode } from "react";
import { getCurrentUserAndRole } from "@/lib/auth/server";
import type { AppRole } from "@/lib/auth/roles";

export default async function RoleGate({
  allow,
  children,
  fallback = null,
}: {
  allow: readonly AppRole[];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { role } = await getCurrentUserAndRole();
  return role && allow.includes(role) ? children : fallback;
}
