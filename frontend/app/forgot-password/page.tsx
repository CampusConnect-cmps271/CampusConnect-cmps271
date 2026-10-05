import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import ForgotPasswordForm from './ForgotPasswordForm'

export const metadata: Metadata = {
  title: 'Reset your password · CampusConnect',
}

export default function ForgotPasswordPage() {
  return (
    <main className="cc-page auth-page">
      <div className="auth-top">
        <Link href="/" className="back-link">
          <ArrowLeft size={18} aria-hidden="true" /> Go back home
        </Link>
      </div>
      <Link href="/" className="brand auth-brand">
        <span className="brand-mark" aria-hidden="true">C</span>
        CampusConnect
      </Link>
      <div className="auth-card">
        <ForgotPasswordForm />
      </div>
    </main>
  )
}
