import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
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
    <main className="cc-page auth-page">
      <div className="auth-top">
        <Link href="/" className="back-link">
          <ArrowLeft size={18} aria-hidden="true" /> Go back home
        </Link>
      </div>
      <Link href="/" className="brand auth-brand">
        <span className="brand-mark" aria-hidden="true">
          C
        </span>
        CampusConnect
      </Link>
      <div className="auth-card">
        <h1>Log in</h1>
        <p className="auth-subtitle">
          Welcome back to CampusConnect. Use your university email.
        </p>
        <LoginForm next={safeNextPath(next)} />
      </div>
    </main>
  );
}
