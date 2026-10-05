import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  DEFAULT_SIGNED_IN_PATH,
  getCurrentUser,
  RegisterForm,
} from "@/modules/auth";

export const metadata: Metadata = {
  title: "Sign up · CampusConnect",
  description: "Create a CampusConnect account with your university email.",
};

export default async function RegisterPage() {
  // A signed-in student has no use for this page.
  if (await getCurrentUser()) {
    redirect(DEFAULT_SIGNED_IN_PATH);
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-4 py-12 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Create your account
        </h1>
        <p className="text-sm opacity-80">
          Join CampusConnect with your university email.
        </p>
      </header>

      <RegisterForm />
    </main>
  );
}
