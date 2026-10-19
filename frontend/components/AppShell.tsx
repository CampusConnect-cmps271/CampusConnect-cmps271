import type { ReactNode } from "react";
import Link from "next/link";

/**
 * Brand frame for signed-in pages: the same fonts, colours and wordmark as the
 * landing page, so the app looks like one product.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="cc-page app-shell">
      <header className="app-header">
        <Link href="/home" className="brand">
          <span className="brand-mark" aria-hidden="true">
            C
          </span>
          CampusConnect
        </Link>
      </header>
      {children}
    </div>
  );
}
