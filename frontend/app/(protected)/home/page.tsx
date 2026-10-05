import type { Metadata } from "next";
import { LogoutButton, requireUser } from "@/modules/auth";

export const metadata: Metadata = {
  title: "Home · CampusConnect",
};

/**
 * Placeholder protected home page (SP1-08). The real feed arrives in a later
 * sprint; this exists so login, session refresh and logout have somewhere to
 * land and can be verified end to end.
 */
export default async function HomePage() {
  const user = await requireUser();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-12 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Welcome, {user.name}
          </h1>
          {user.email ? (
            <p className="text-sm opacity-80">Signed in as {user.email}</p>
          ) : null}
        </div>

        <LogoutButton />
      </header>

      <p className="text-sm opacity-80">
        You are signed in. This is a placeholder for the CampusConnect home
        page.
      </p>
    </main>
  );
}
