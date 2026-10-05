import type { Metadata } from "next";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { normalizeUniversityEmail } from "@/lib/auth/verification";
import VerificationForm from "./verification-form";
import styles from "./verification.module.css";

export const metadata: Metadata = {
  title: "Verify your email | CampusConnect",
  description: "Confirm your university email using your CampusConnect verification code.",
  robots: { index: false, follow: false },
};

export default async function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  const query = await searchParams;
  const initialEmail = typeof query.email === "string"
    ? normalizeUniversityEmail(query.email) ?? ""
    : "";

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="verification-title">
        <p className={styles.brand}>CampusConnect</p>
        <div className={styles.icon} aria-hidden="true">✉</div>
        <h1 id="verification-title">Verify your university email</h1>
        <p className={styles.intro}>Enter the code sent to your university email to finish setting up your account.</p>
        <VerificationForm initialEmail={initialEmail} configured={Boolean(getSupabaseConfig())} />
      </section>
    </main>
  );
}
