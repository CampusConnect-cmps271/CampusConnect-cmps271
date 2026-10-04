import Link from "next/link";
import { DEFAULT_SIGNED_IN_PATH, LOGIN_PATH } from "../navigation";
import { getCurrentUser } from "../session";
import { LogoutButton } from "./LogoutButton";

const LINK_CLASS =
  "rounded-md border border-black/15 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:border-white/20 dark:hover:bg-white/10";

/**
 * Auth entry points for the landing page (SP1-03).
 *
 * A Server Component, because it reads the verified session. Drop it into the
 * landing page header: `<AuthButtons />`.
 */
export async function AuthButtons() {
  const user = await getCurrentUser();

  return (
    <nav aria-label="Account" className="flex flex-wrap items-center gap-2">
      {user ? (
        <>
          <Link href={DEFAULT_SIGNED_IN_PATH} className={LINK_CLASS}>
            Home
          </Link>
          <LogoutButton />
        </>
      ) : (
        <Link
          href={LOGIN_PATH}
          className="rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
        >
          Log in
        </Link>
      )}
    </nav>
  );
}
