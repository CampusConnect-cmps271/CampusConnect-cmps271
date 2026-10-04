import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/auth/forgot-password/route'
import { createSupabaseAuthClient, SupabaseNotConfiguredError } from '@/lib/supabase/auth-client'
import { FORGOT_PASSWORD_MESSAGE } from '@/lib/auth/password-reset'
import { authError, fakeSupabase, postRequest } from '../helpers'

vi.mock('@/lib/supabase/auth-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/supabase/auth-client')>()),
  createSupabaseAuthClient: vi.fn(),
}))

const URL = '/api/auth/forgot-password'
let supabase: ReturnType<typeof fakeSupabase>

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  supabase = fakeSupabase()
  vi.mocked(createSupabaseAuthClient).mockReturnValue(supabase as never)
})

describe('POST /api/auth/forgot-password', () => {
  describe('valid requests', () => {
    it('sends a reset code and returns the generic message', async () => {
      const res = await POST(postRequest(URL, { email: 'Student@Mail.AUB.edu ' }))

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ message: FORGOT_PASSWORD_MESSAGE })
      expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith('student@mail.aub.edu')
    })

    it('returns the same response for an unregistered email (no account enumeration)', async () => {
      supabase.auth.resetPasswordForEmail.mockResolvedValue({ data: null, error: authError(400, 'user_not_found') })

      const res = await POST(postRequest(URL, { email: 'nobody@mail.aub.edu' }))

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ message: FORGOT_PASSWORD_MESSAGE })
    })
  })

  describe('input validation', () => {
    it.each([
      ['missing email', {}],
      ['empty email', { email: '   ' }],
      ['malformed email', { email: 'not-an-email' }],
      ['non-string email', { email: 12345 }],
    ])('rejects %s with 400 VALIDATION_FAILED', async (_name, body) => {
      const res = await POST(postRequest(URL, body))
      const json = await res.json()

      expect(res.status).toBe(400)
      expect(json.error).toBe('VALIDATION_FAILED')
      expect(json.fields.email).toBeTruthy()
      expect(supabase.auth.resetPasswordForEmail).not.toHaveBeenCalled()
    })

    it('rejects a body that is not JSON with 400 INVALID_JSON', async () => {
      const res = await POST(postRequest(URL, 'email=a@b.com', true))

      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('INVALID_JSON')
    })

    it('rejects a JSON array body with 400 INVALID_JSON', async () => {
      const res = await POST(postRequest(URL, ['a@b.com']))

      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('INVALID_JSON')
    })
  })

  describe('error handling', () => {
    it('returns 429 RATE_LIMITED when Supabase throttles emails', async () => {
      supabase.auth.resetPasswordForEmail.mockResolvedValue({
        data: null,
        error: authError(429, 'over_email_send_rate_limit'),
      })

      const res = await POST(postRequest(URL, { email: 'student@mail.aub.edu' }))

      expect(res.status).toBe(429)
      expect((await res.json()).error).toBe('RATE_LIMITED')
    })

    it('returns 503 SERVICE_UNAVAILABLE when Supabase fails', async () => {
      supabase.auth.resetPasswordForEmail.mockResolvedValue({ data: null, error: authError(500, 'unexpected_failure') })

      const res = await POST(postRequest(URL, { email: 'student@mail.aub.edu' }))

      expect(res.status).toBe(503)
      expect((await res.json()).error).toBe('SERVICE_UNAVAILABLE')
    })

    it('returns 503 SERVICE_UNAVAILABLE when Supabase is not configured', async () => {
      vi.mocked(createSupabaseAuthClient).mockImplementation(() => {
        throw new SupabaseNotConfiguredError()
      })

      const res = await POST(postRequest(URL, { email: 'student@mail.aub.edu' }))

      expect(res.status).toBe(503)
      expect((await res.json()).error).toBe('SERVICE_UNAVAILABLE')
    })
  })
})
