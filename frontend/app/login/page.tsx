import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  DEFAULT_SIGNED_IN_PATH,
  getCurrentUser,
  LoginForm,
  safeNextPath,
} from "@/modules/auth";

export const metadata: Metadata = {
  title: "Log in · CampusConnect",
  description: "Log in to your CampusConnect account.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  // A signed-in student has no use for this page.
  if (await getCurrentUser()) {
    redirect(DEFAULT_SIGNED_IN_PATH);
  }

  const { next } = await searchParams;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-4 py-12 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Log in
        </h1>
        <p className="text-sm opacity-80">
          Welcome back to CampusConnect. Use your university email.
        </p>
      </header>

      <LoginForm next={safeNextPath(next)} />
    </main>
  );
}
