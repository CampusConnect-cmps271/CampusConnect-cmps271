// Shared by the forgot-password page (instant feedback) and the API route
// handlers (the source of truth), so both enforce exactly the same rules.
//
// The password policy itself lives in modules/auth/password.ts, the team's
// single source of truth that mirrors Supabase Auth. It is reused here, not
// copied, so registration, login and password reset can never drift apart.

import { passwordProblems } from '@/modules/auth/password'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Supabase email codes are 6 to 10 digits; the team's project uses 8
// (otp_length in supabase/config.toml). Accepting the whole range means a
// change to that setting never breaks password reset.
const CODE_PATTERN = /^\d{6,10}$/

export type FieldErrors = Partial<Record<'email' | 'code' | 'newPassword' | 'confirmPassword', string>>

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function validateEmail(email: unknown): string | undefined {
  if (typeof email !== 'string' || email.trim() === '') return 'Email is required.'
  if (email.length > 254 || !EMAIL_PATTERN.test(email.trim())) return 'Enter a valid email address.'
  return undefined
}

export function validateCode(code: unknown): string | undefined {
  if (typeof code !== 'string' || code.trim() === '') return 'Reset code is required.'
  if (!CODE_PATTERN.test(code.trim())) return 'Enter the code from your email, using digits only.'
  return undefined
}

/** "Be at least 8 characters long" -> "be at least 8 characters long" */
function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1)
}

export function validateNewPassword(password: unknown): string | undefined {
  if (typeof password !== 'string' || password === '') return 'New password is required.'
  const problems = passwordProblems(password)
  if (problems.length > 0) {
    return `Password must ${problems.map(lowerFirst).join(', ')}.`
  }
  return undefined
}

export function validateForgotPassword(body: { email?: unknown }): FieldErrors {
  const errors: FieldErrors = {}
  const email = validateEmail(body.email)
  if (email) errors.email = email
  return errors
}

export function validateResetPassword(body: {
  email?: unknown
  code?: unknown
  newPassword?: unknown
  confirmPassword?: unknown
}): FieldErrors {
  const errors: FieldErrors = {}
  const email = validateEmail(body.email)
  if (email) errors.email = email
  const code = validateCode(body.code)
  if (code) errors.code = code
  const password = validateNewPassword(body.newPassword)
  if (password) errors.newPassword = password
  if (typeof body.confirmPassword !== 'string' || body.confirmPassword === '') {
    errors.confirmPassword = 'Please confirm your new password.'
  } else if (body.confirmPassword !== body.newPassword) {
    errors.confirmPassword = 'Passwords do not match.'
  }
  return errors
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0
}
