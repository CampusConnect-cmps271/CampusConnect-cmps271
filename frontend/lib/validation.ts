// Shared by the forgot-password page (instant feedback) and the API route
// handlers (the source of truth), so both enforce exactly the same rules.

export const PASSWORD_MIN_LENGTH = 8

export const PASSWORD_RULES: { label: string; test: (pw: string) => boolean }[] = [
  { label: `At least ${PASSWORD_MIN_LENGTH} characters`, test: (pw) => pw.length >= PASSWORD_MIN_LENGTH },
  { label: 'One uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
  { label: 'One lowercase letter', test: (pw) => /[a-z]/.test(pw) },
  { label: 'One number', test: (pw) => /[0-9]/.test(pw) },
  { label: 'One symbol (e.g. ! @ # $)', test: (pw) => /[^A-Za-z0-9]/.test(pw) },
]

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Supabase email OTPs are 6 digits by default; the length is configurable up to 10.
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
  if (!CODE_PATTERN.test(code.trim())) return 'The reset code is the 6-digit number from your email.'
  return undefined
}

export function validateNewPassword(password: unknown): string | undefined {
  if (typeof password !== 'string' || password === '') return 'New password is required.'
  if (password.length > 72) return 'Password must be at most 72 characters.'
  const failed = PASSWORD_RULES.filter((rule) => !rule.test(password))
  if (failed.length > 0) {
    return `Password must include: ${failed.map((rule) => rule.label.toLowerCase()).join(', ')}.`
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
