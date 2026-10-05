import { NextResponse } from 'next/server'
import { apiError, invalidJson, readJsonObject, validationError } from '@/lib/api'
import { resetPassword } from '@/lib/auth/password-reset'
import { hasErrors, validateResetPassword } from '@/lib/validation'

/**
 * POST /api/auth/reset-password
 * Body: { email, code, newPassword, confirmPassword }
 * 200 -> { message } once the password has been changed.
 */
export async function POST(request: Request) {
  const body = await readJsonObject(request)
  if (!body) return invalidJson()

  const errors = validateResetPassword(body)
  if (hasErrors(errors)) return validationError(errors)

  const result = await resetPassword(body.email as string, body.code as string, body.newPassword as string)
  if (!result.ok) return apiError(result.status, result.error, result.message)

  return NextResponse.json({ message: 'Your password has been reset. You can now log in with your new password.' })
}
