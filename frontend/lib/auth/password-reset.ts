import type { AuthError } from '@supabase/supabase-js'
import { createSupabaseAuthClient, SupabaseNotConfiguredError } from '@/lib/supabase/auth-client'
import { normalizeEmail } from '@/lib/validation'

export type PasswordResetErrorCode =
  | 'INVALID_OR_EXPIRED_CODE'
  | 'WEAK_PASSWORD'
  | 'SAME_PASSWORD'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE'

export type PasswordResetResult =
  | { ok: true }
  | { ok: false; status: number; error: PasswordResetErrorCode; message: string }

// Shown for every forgot-password request, whether or not the email is
// registered, so the endpoint cannot be used to discover accounts.
export const FORGOT_PASSWORD_MESSAGE =
  'If an account exists for that email, a password reset code has been sent.'

const FAILURES: Record<PasswordResetErrorCode, Omit<Extract<PasswordResetResult, { ok: false }>, 'ok'>> = {
  INVALID_OR_EXPIRED_CODE: {
    status: 400,
    error: 'INVALID_OR_EXPIRED_CODE',
    message: 'This reset code is invalid or has expired. Request a new code and try again.',
  },
  WEAK_PASSWORD: {
    status: 400,
    error: 'WEAK_PASSWORD',
    message: 'This password is too weak or commonly used. Choose a stronger password.',
  },
  SAME_PASSWORD: {
    status: 400,
    error: 'SAME_PASSWORD',
    message: 'Your new password must be different from your current password.',
  },
  RATE_LIMITED: {
    status: 429,
    error: 'RATE_LIMITED',
    message: 'Too many attempts. Please wait a few minutes and try again.',
  },
  SERVICE_UNAVAILABLE: {
    status: 503,
    error: 'SERVICE_UNAVAILABLE',
    message: 'Password reset is temporarily unavailable. Please try again later.',
  },
}

function fail(code: PasswordResetErrorCode): PasswordResetResult {
  return { ok: false, ...FAILURES[code] }
}

function isRateLimited(error: AuthError): boolean {
  return error.status === 429 || error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit'
}

/** Masks an email for logs: "student@mail.aub.edu" -> "st***@mail.aub.edu". */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  return `${local.slice(0, 2)}***@${domain ?? ''}`
}

function getClient() {
  try {
    return createSupabaseAuthClient()
  } catch (err) {
    if (err instanceof SupabaseNotConfiguredError) {
      console.error('[password-reset] Supabase is not configured:', err.message)
      return null
    }
    throw err
  }
}

/** Step 1: ask Supabase to email a recovery code. */
export async function requestPasswordReset(rawEmail: string): Promise<PasswordResetResult> {
  const email = normalizeEmail(rawEmail)
  const supabase = getClient()
  if (!supabase) return fail('SERVICE_UNAVAILABLE')

  const { error } = await supabase.auth.resetPasswordForEmail(email)
  if (!error) {
    console.info(`[password-reset] reset code requested for ${maskEmail(email)}`)
    return { ok: true }
  }
  if (isRateLimited(error)) {
    console.warn(`[password-reset] rate limited for ${maskEmail(email)}`)
    return fail('RATE_LIMITED')
  }
  if (!error.status || error.status >= 500) {
    console.error('[password-reset] Supabase error while sending code:', error.code, error.message)
    return fail('SERVICE_UNAVAILABLE')
  }
  // Any other 4xx (e.g. an unknown or unconfirmed user) is reported as success
  // so the response never reveals whether the email is registered.
  console.info(`[password-reset] request not sent for ${maskEmail(email)} (${error.code ?? error.status})`)
  return { ok: true }
}

/** Step 2: verify the emailed code, then set the new password. */
export async function resetPassword(rawEmail: string, code: string, newPassword: string): Promise<PasswordResetResult> {
  const email = normalizeEmail(rawEmail)
  const supabase = getClient()
  if (!supabase) return fail('SERVICE_UNAVAILABLE')

  const { data, error: verifyError } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: 'recovery' })
  if (verifyError || !data.session) {
    if (verifyError && isRateLimited(verifyError)) return fail('RATE_LIMITED')
    if (verifyError && (!verifyError.status || verifyError.status >= 500)) {
      console.error('[password-reset] Supabase error while verifying code:', verifyError.code, verifyError.message)
      return fail('SERVICE_UNAVAILABLE')
    }
    // Wrong code, expired code and unknown email all look the same to the caller.
    console.info(`[password-reset] invalid or expired code for ${maskEmail(email)}`)
    return fail('INVALID_OR_EXPIRED_CODE')
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
  if (updateError) {
    if (updateError.code === 'same_password') return fail('SAME_PASSWORD')
    if (updateError.code === 'weak_password') return fail('WEAK_PASSWORD')
    if (isRateLimited(updateError)) return fail('RATE_LIMITED')
    console.error('[password-reset] Supabase error while updating password:', updateError.code, updateError.message)
    return fail('SERVICE_UNAVAILABLE')
  }

  // Revoke every existing session so anyone holding the old password is logged out.
  const { error: signOutError } = await supabase.auth.signOut({ scope: 'global' })
  if (signOutError) {
    console.warn('[password-reset] could not revoke sessions after reset:', signOutError.code, signOutError.message)
  }

  console.info(`[password-reset] password updated for ${maskEmail(email)}`)
  return { ok: true }
}
