import { NextResponse } from 'next/server'
import { apiError, invalidJson, readJsonObject, validationError } from '@/lib/api'
import { FORGOT_PASSWORD_MESSAGE, requestPasswordReset } from '@/lib/auth/password-reset'
import { hasErrors, validateForgotPassword } from '@/lib/validation'

/**
 * POST /api/auth/forgot-password
 * Body: { email }
 * 200 -> { message } for every well-formed email, registered or not.
 */
export async function POST(request: Request) {
  const body = await readJsonObject(request)
  if (!body) return invalidJson()

  const errors = validateForgotPassword(body)
  if (hasErrors(errors)) return validationError(errors)

  const result = await requestPasswordReset(body.email as string)
  if (!result.ok) return apiError(result.status, result.error, result.message)

  return NextResponse.json({ message: FORGOT_PASSWORD_MESSAGE })
}
