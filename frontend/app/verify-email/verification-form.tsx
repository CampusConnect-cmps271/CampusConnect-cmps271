"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  VERIFICATION_CODE_LENGTH,
  resendUniversityCode,
  verificationError,
  verifyUniversityEmail,
  type VerificationResult,
} from "@/lib/auth/verification";
import styles from "./verification.module.css";

export default function VerificationForm({ initialEmail, configured }: { initialEmail: string; configured: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState<"verify" | "resend" | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [verified, setVerified] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const requestInFlight = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function submit(operation: "verify" | "resend") {
    if (!configured || verified || requestInFlight.current || (operation === "resend" && cooldown > 0)) return;
    requestInFlight.current = true;
    setPending(operation);
    setResult(null);

    try {
      const { auth } = createClient();
      const nextResult = operation === "verify"
        ? await verifyUniversityEmail(auth, email, code)
        : await resendUniversityCode(auth, email);
      setResult(nextResult);
      if (nextResult.cooldown) setCooldown(nextResult.cooldown);
      if (operation === "verify" && nextResult.ok) {
        setCode("");
        setVerified(true);
      } else if (operation === "resend" && nextResult.ok) {
        setCode("");
      }
    } catch (error) {
      setResult(verificationError(error, operation));
    } finally {
      requestInFlight.current = false;
      setPending(null);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit("verify");
  }

  if (!configured) {
    return <p className={styles.error} role="alert">Email verification is temporarily unavailable. Please try again later.</p>;
  }

  if (verified) {
    return (
      <div className={styles.success} role="status">
        <h2>Email verified</h2>
        <p>{result?.message}</p>
        <button type="button" className={styles.primary} onClick={() => {
          // The profile moved from "/" to "/profile" when "/" became the landing page.
          router.push("/profile");
          router.refresh();
        }}>Continue to CampusConnect</button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-busy={Boolean(pending)} className={styles.form}>
      <div>
        <label htmlFor="university-email">University email</label>
        <input id="university-email" name="email" type="email" autoComplete="email"
          inputMode="email" autoCapitalize="none" spellCheck={false} required
          value={email} disabled={Boolean(pending)} aria-describedby="email-help"
          onChange={(event) => { setEmail(event.target.value); setCode(""); setResult(null); }}
          placeholder="student@mail.aub.edu" />
        <p id="email-help" className={styles.help}>Use the @mail.aub.edu address you registered with.</p>
      </div>
      <div>
        <label htmlFor="verification-code">Verification code</label>
        <input id="verification-code" name="code" type="text" inputMode="numeric"
          autoComplete="one-time-code" required value={code} disabled={Boolean(pending)}
          className={styles.code} aria-describedby="code-help" spellCheck={false}
          onChange={(event) => { setCode(event.target.value); setResult(null); }}
          placeholder={`${VERIFICATION_CODE_LENGTH}-digit code`} />
        <p id="code-help" className={styles.help}>Enter the {VERIFICATION_CODE_LENGTH}-digit code from your latest email.</p>
      </div>
      {result && (
        <p className={result.ok ? styles.notice : styles.error} role={result.ok ? "status" : "alert"}>
          {result.message}
        </p>
      )}
      <button type="submit" className={styles.primary} disabled={Boolean(pending)}>
        {pending === "verify" ? "Verifying…" : "Verify email"}
      </button>
      <div className={styles.resend}>
        <p>Didn&apos;t receive a code? Check your Junk/Spam folder.</p>
        <button type="button" className={styles.secondary}
          disabled={Boolean(pending) || cooldown > 0} onClick={() => void submit("resend")}>
          {pending === "resend" ? "Requesting code…" : cooldown > 0 ? `Resend available in ${cooldown}s` : "Resend code"}
        </button>
      </div>
    </form>
  );
}
