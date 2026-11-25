import Link from "next/link";
import type { ReactNode } from "react";
import { AppShell } from "./AppShell";

const ADMIN_LINKS = [
  ["/admin", "Roles"],
  ["/admin/accounts", "Accounts"],
  ["/admin/clubs", "Club verification"],
  ["/moderation", "Moderation"],
  ["/admin/audit", "Audit log"],
  ["/admin/health", "Health"],
  ["/admin/availability", "Availability"],
  ["/admin/errors", "Errors"],
  ["/admin/performance", "Performance"],
] as const;

export const ADMIN_CARD =
  "rounded-2xl border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)] sm:p-6";
export const ADMIN_FIELD =
  "min-h-11 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-[var(--ink)] placeholder:text-[var(--ink-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]";
export const ADMIN_PRIMARY =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--maroon)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--maroon-dark)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)] disabled:cursor-not-allowed disabled:opacity-60";
export const ADMIN_SECONDARY =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--ink)] hover:bg-[var(--maroon-50)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)] disabled:cursor-not-allowed disabled:opacity-60";

export function AdminPageShell({
  title,
  description,
  eyebrow = "CampusConnect operations",
  maxWidth = "max-w-7xl",
  children,
}: {
  title: string;
  description: string;
  eyebrow?: string;
  maxWidth?: "max-w-4xl" | "max-w-5xl" | "max-w-6xl" | "max-w-7xl";
  children: ReactNode;
}) {
  return (
    <AppShell>
      <main className="min-h-screen bg-[var(--maroon-50)] px-4 py-6 text-[var(--ink)] sm:px-6 sm:py-10">
        <div className={`mx-auto flex w-full ${maxWidth} flex-col gap-6`}>
          <header className="overflow-hidden rounded-2xl border border-[var(--maroon-200)] bg-white shadow-[var(--shadow-md)]">
            <div className="bg-[linear-gradient(135deg,var(--maroon-deep),var(--maroon))] px-5 py-6 text-white sm:px-7">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--yellow-200)]">{eyebrow}</p>
              <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">{title}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-white/85 sm:text-base">{description}</p>
            </div>
            <nav aria-label="Administration sections" className="flex gap-2 overflow-x-auto p-3">
              {ADMIN_LINKS.map(([href, label]) => (
                <Link
                  key={href}
                  href={href}
                  className="min-h-10 shrink-0 rounded-lg px-3 py-2 text-sm font-semibold text-[var(--ink-soft)] hover:bg-[var(--maroon-50)] hover:text-[var(--maroon)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]"
                >
                  {label}
                </Link>
              ))}
            </nav>
          </header>
          {children}
        </div>
      </main>
    </AppShell>
  );
}

export function AdminEmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--maroon-50)] p-8 text-center">
      <h2 className="text-lg font-bold text-[var(--ink)]">{title}</h2>
      <p className="mt-2 text-sm text-[var(--ink-soft)]">{detail}</p>
    </div>
  );
}
