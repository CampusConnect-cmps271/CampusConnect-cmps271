import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, KeyRound } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Log in · CampusConnect',
}

// Placeholder so the landing page's "Log in" buttons don't 404.
// Replace this file with the real login page (SCRUM-107 / SCRUM-117 / SCRUM-120).
export default function LoginPage() {
  return (
    <main className="auth-page">
      <div className="auth-top">
        <Link href="/" className="back-link">
          <ArrowLeft size={18} aria-hidden="true" /> Go back home
        </Link>
      </div>
      <Link href="/" className="brand auth-brand">
        <span className="brand-mark" aria-hidden="true">C</span>
        CampusConnect
      </Link>
      <div className="auth-card auth-placeholder">
        <div className="auth-placeholder-icon" aria-hidden="true">
          <KeyRound size={26} />
        </div>
        <h1>Log in is almost here</h1>
        <p className="auth-subtitle">
          We&apos;re putting the finishing touches on signing in with your university email.
          Check back soon.
        </p>
        <Link href="/" className="btn btn-primary btn-block">Go back home</Link>
        <p className="auth-footer">
          Locked out? <Link href="/forgot-password">Reset your password</Link>
        </p>
      </div>
    </main>
  )
}
