import { NextResponse } from 'next/server'
import type { FieldErrors } from '@/lib/validation'

// Every API error uses this shape: { error, message, fields? }.
export function apiError(status: number, error: string, message: string, fields?: FieldErrors) {
  return NextResponse.json(fields ? { error, message, fields } : { error, message }, { status })
}

export function validationError(fields: FieldErrors) {
  return apiError(400, 'VALIDATION_FAILED', 'Some fields are missing or invalid.', fields)
}

/** Parses a JSON object body, or returns null when the body is missing or not an object. */
export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json()
    return body !== null && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export function invalidJson() {
  return apiError(400, 'INVALID_JSON', 'Request body must be a JSON object.')
}
