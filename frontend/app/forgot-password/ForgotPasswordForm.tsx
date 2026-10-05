'use client'

import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import { LOGIN_PATH } from '@/modules/auth/navigation'
import { PASSWORD_RULES } from '@/modules/auth/password'
import {
  hasErrors,
  validateForgotPassword,
  validateResetPassword,
  type FieldErrors,
} from '@/lib/validation'

type Step = 'request' | 'reset' | 'done'

interface ApiResponse {
  message?: string
  error?: string
  fields?: FieldErrors
}

async function postJson(url: string, body: object): Promise<{ ok: boolean; data: ApiResponse }> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({}))) as ApiResponse
    return { ok: res.ok, data }
  } catch {
    return { ok: false, data: { message: 'Could not reach the server. Check your connection and try again.' } }
  }
}

export default function ForgotPasswordForm() {
  const [step, setStep] = useState<Step>('request')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function sendCode(isResend = false) {
    setFormError('')
    setNotice('')
    const errors = validateForgotPassword({ email })
    setFieldErrors(errors)
    if (hasErrors(errors)) return

    setSubmitting(true)
    const { ok, data } = await postJson('/api/auth/forgot-password', { email })
    setSubmitting(false)

    if (!ok) {
      setFieldErrors(data.fields ?? {})
      setFormError(data.message ?? 'Something went wrong. Please try again.')
      return
    }
    if (isResend) setCode('')
    setNotice(isResend ? 'If an account exists for that email, a new code has been requested. Use the most recent code you received.' : (data.message ?? ''))
    setStep('reset')
  }

  async function submitReset(e: FormEvent) {
    e.preventDefault()
    setFormError('')
    const errors = validateResetPassword({ email, code, newPassword, confirmPassword })
    setFieldErrors(errors)
    if (hasErrors(errors)) return

    setSubmitting(true)
    const { ok, data } = await postJson('/api/auth/reset-password', { email, code, newPassword, confirmPassword })
    setSubmitting(false)

    if (!ok) {
      setFieldErrors(data.fields ?? {})
      setFormError(data.message ?? 'Something went wrong. Please try again.')
      return
    }
    setNotice(data.message ?? '')
    setStep('done')
  }

  if (step === 'done') {
    return (
      <div className="auth-success" role="status">
        <div className="auth-success-icon" aria-hidden="true">✓</div>
        <h1>Password updated</h1>
        <p>{notice}</p>
        <Link href={LOGIN_PATH} className="btn btn-primary btn-block">Back to log in</Link>
        <Link href="/" className="btn btn-ghost btn-block auth-secondary">Go back home</Link>
      </div>
    )
  }

  if (step === 'request') {
    return (
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void sendCode()
        }}
      >
        <h1>Forgot your password?</h1>
        <p className="auth-subtitle">
          Enter the email you use for CampusConnect and we&apos;ll send you a code to reset your password.
        </p>

        {formError && <div className="alert alert-error" role="alert">{formError}</div>}

        <div className="field">
          <label htmlFor="email">University email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@mail.aub.edu"
            value={email}
            disabled={submitting}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!fieldErrors.email}
            aria-describedby={fieldErrors.email ? 'email-error' : undefined}
          />
          {fieldErrors.email && <p className="field-error" id="email-error">{fieldErrors.email}</p>}
        </div>

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Sending…' : 'Send reset code'}
        </button>

        <p className="auth-footer">
          Remembered it? <Link href={LOGIN_PATH}>Back to log in</Link>
        </p>
      </form>
    )
  }

  return (
    <form noValidate onSubmit={submitReset}>
      <h1>Reset your password</h1>
      <p className="auth-subtitle">
        Enter the code sent to <strong>{email}</strong> and choose a new password.
      </p>

      {notice && <div className="alert alert-info" role="status">{notice}</div>}
      {formError && <div className="alert alert-error" role="alert">{formError}</div>}

      <div className="field">
        <label htmlFor="code">Reset code</label>
        <input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="Code from your email"
          maxLength={10}
          value={code}
          disabled={submitting}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          aria-invalid={!!fieldErrors.code}
          aria-describedby={fieldErrors.code ? 'code-error' : undefined}
        />
        {fieldErrors.code && <p className="field-error" id="code-error">{fieldErrors.code}</p>}
      </div>

      <div className="field">
        <label htmlFor="newPassword">New password</label>
        <input
          id="newPassword"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          value={newPassword}
          disabled={submitting}
          onChange={(e) => setNewPassword(e.target.value)}
          aria-invalid={!!fieldErrors.newPassword}
          aria-describedby="password-rules"
        />
        <ul className="password-rules" id="password-rules">
          {/* The 72-character cap is enforced but not listed: it is met until it isn't. */}
          {PASSWORD_RULES.filter((rule) => rule.id !== 'maxLength').map((rule) => (
            <li key={rule.id} className={rule.isMet(newPassword) ? 'met' : ''}>
              {rule.label}
            </li>
          ))}
        </ul>
        {fieldErrors.newPassword && <p className="field-error">{fieldErrors.newPassword}</p>}
      </div>

      <div className="field">
        <label htmlFor="confirmPassword">Confirm new password</label>
        <input
          id="confirmPassword"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          value={confirmPassword}
          disabled={submitting}
          onChange={(e) => setConfirmPassword(e.target.value)}
          aria-invalid={!!fieldErrors.confirmPassword}
          aria-describedby={fieldErrors.confirmPassword ? 'confirm-error' : undefined}
        />
        {fieldErrors.confirmPassword && (
          <p className="field-error" id="confirm-error">{fieldErrors.confirmPassword}</p>
        )}
      </div>

      <label className="checkbox">
        <input type="checkbox" checked={showPassword} disabled={submitting} onChange={(e) => setShowPassword(e.target.checked)} />
        Show passwords
      </label>

      <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
        {submitting ? 'Resetting…' : 'Reset password'}
      </button>

      <div className="auth-links">
        <button type="button" className="link-button" disabled={submitting} onClick={() => void sendCode(true)}>
          Resend code
        </button>
        <button
          type="button"
          className="link-button"
          disabled={submitting}
          onClick={() => {
            setStep('request')
            setCode('')
            setNewPassword('')
            setConfirmPassword('')
            setShowPassword(false)
            setFieldErrors({})
            setFormError('')
            setNotice('')
          }}
        >
          Use a different email
        </button>
      </div>
    </form>
  )
}
