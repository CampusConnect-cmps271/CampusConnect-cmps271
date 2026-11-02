import type { ReactNode } from "react";

/**
 * Brand frame for signed-in pages: the same fonts and colours as the landing
 * page, so the app looks like one product. The wordmark lives in the
 * signed-in header (AppHeader), so it is not repeated here.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return <div className="cc-page app-shell">{children}</div>;
}
