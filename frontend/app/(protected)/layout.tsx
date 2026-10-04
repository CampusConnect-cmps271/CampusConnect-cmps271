import type { ReactNode } from "react";
import { requireUser } from "@/modules/auth";

/**
 * Every page in this route group requires a signed-in student.
 *
 * This is a convenience gate, not the only one: each page and Server Action
 * still checks for itself, because a layout does not re-run on every request
 * and a Server Action POSTs to the route rather than through this layout.
 */
export default async function ProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireUser();

  return children;
}
