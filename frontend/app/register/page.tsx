import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
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
    <main className="cc-page auth-page">
      <div className="auth-top auth-top-wide">
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
      <div className="auth-card auth-card-wide">
        <h1>Create your account</h1>
        <p className="auth-subtitle">
          Join CampusConnect with your university email.
        </p>
        <RegisterForm />
      </div>
    </main>
  );
}
