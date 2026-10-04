import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/auth/reset-password/route'
import { createSupabaseAuthClient } from '@/lib/supabase/auth-client'
import { authError, fakeSupabase, postRequest } from '../helpers'

vi.mock('@/lib/supabase/auth-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/supabase/auth-client')>()),
  createSupabaseAuthClient: vi.fn(),
}))

const URL = '/api/auth/reset-password'
const VALID = {
  email: 'student@mail.aub.edu',
  code: '123456',
  newPassword: 'NewPass#2026',
  confirmPassword: 'NewPass#2026',
}
let supabase: ReturnType<typeof fakeSupabase>

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  supabase = fakeSupabase()
  vi.mocked(createSupabaseAuthClient).mockReturnValue(supabase as never)
})

describe('POST /api/auth/reset-password', () => {
  describe('valid requests', () => {
    it('verifies the code, updates the password and revokes old sessions', async () => {
      const res = await POST(postRequest(URL, VALID))

      expect(res.status).toBe(200)
      expect((await res.json()).message).toMatch(/password has been reset/i)
      expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({
        email: 'student@mail.aub.edu',
        token: '123456',
        type: 'recovery',
      })
      expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'NewPass#2026' })
      expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'global' })
    })

    it('still succeeds if revoking old sessions fails', async () => {
      supabase.auth.signOut.mockResolvedValue({ error: authError(500, 'unexpected_failure') })

      const res = await POST(postRequest(URL, VALID))

      expect(res.status).toBe(200)
    })
  })

  describe('input validation', () => {
    it.each([
      ['missing email', { ...VALID, email: undefined }, 'email'],
      ['malformed email', { ...VALID, email: 'student@' }, 'email'],
      ['missing code', { ...VALID, code: '' }, 'code'],
      ['non-numeric code', { ...VALID, code: '12ab56' }, 'code'],
      ['too-short code', { ...VALID, code: '123' }, 'code'],
      ['too-short password', { ...VALID, newPassword: 'Ab1!', confirmPassword: 'Ab1!' }, 'newPassword'],
      ['password without uppercase', { ...VALID, newPassword: 'newpass#2026', confirmPassword: 'newpass#2026' }, 'newPassword'],
      ['password without lowercase', { ...VALID, newPassword: 'NEWPASS#2026', confirmPassword: 'NEWPASS#2026' }, 'newPassword'],
      ['password without number', { ...VALID, newPassword: 'NewPass#abcd', confirmPassword: 'NewPass#abcd' }, 'newPassword'],
      ['password without symbol', { ...VALID, newPassword: 'NewPass2026', confirmPassword: 'NewPass2026' }, 'newPassword'],
      ['missing confirmation', { ...VALID, confirmPassword: undefined }, 'confirmPassword'],
      ['mismatched confirmation', { ...VALID, confirmPassword: 'Different#2026' }, 'confirmPassword'],
    ])('rejects %s with 400 VALIDATION_FAILED', async (_name, body, field) => {
      const res = await POST(postRequest(URL, body))
      const json = await res.json()

      expect(res.status).toBe(400)
      expect(json.error).toBe('VALIDATION_FAILED')
      expect(json.fields[field]).toBeTruthy()
      expect(supabase.auth.verifyOtp).not.toHaveBeenCalled()
    })

    it('reports every invalid field at once', async () => {
      const res = await POST(postRequest(URL, {}))
      const json = await res.json()

      expect(res.status).toBe(400)
      expect(Object.keys(json.fields).sort()).toEqual(['code', 'confirmPassword', 'email', 'newPassword'])
    })

    it('rejects a body that is not JSON with 400 INVALID_JSON', async () => {
      const res = await POST(postRequest(URL, '{not json', true))

      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('INVALID_JSON')
    })
  })

  describe('error handling', () => {
    it('returns 400 INVALID_OR_EXPIRED_CODE for a wrong or expired code', async () => {
      supabase.auth.verifyOtp.mockResolvedValue({
        data: { session: null, user: null },
        error: authError(403, 'otp_expired', 'Token has expired or is invalid'),
      })

      const res = await POST(postRequest(URL, VALID))

      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('INVALID_OR_EXPIRED_CODE')
      expect(supabase.auth.updateUser).not.toHaveBeenCalled()
    })

    it('gives an unregistered email the same error as a wrong code', async () => {
      supabase.auth.verifyOtp.mockResolvedValue({
        data: { session: null, user: null },
        error: authError(400, 'user_not_found'),
      })

      const res = await POST(postRequest(URL, { ...VALID, email: 'nobody@mail.aub.edu' }))

      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('INVALID_OR_EXPIRED_CODE')
    })

    it('returns 400 SAME_PASSWORD when the new password equals the old one', async () => {
      supabase.auth.updateUser.mockResolvedValue({ data: null, error: authError(422, 'same_password') })

      const res = await POST(postRequest(URL, VALID))

      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('SAME_PASSWORD')
    })

    it('returns 400 WEAK_PASSWORD when Supabase rejects the password (e.g. leaked password)', async () => {
      supabase.auth.updateUser.mockResolvedValue({ data: null, error: authError(422, 'weak_password') })

      const res = await POST(postRequest(URL, VALID))

      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('WEAK_PASSWORD')
    })

    it('returns 429 RATE_LIMITED when too many codes are tried', async () => {
      supabase.auth.verifyOtp.mockResolvedValue({
        data: { session: null, user: null },
        error: authError(429, 'over_request_rate_limit'),
      })

      const res = await POST(postRequest(URL, VALID))

      expect(res.status).toBe(429)
      expect((await res.json()).error).toBe('RATE_LIMITED')
    })

    it('returns 503 SERVICE_UNAVAILABLE when Supabase fails while updating', async () => {
      supabase.auth.updateUser.mockResolvedValue({ data: null, error: authError(500, 'unexpected_failure') })

      const res = await POST(postRequest(URL, VALID))

      expect(res.status).toBe(503)
      expect((await res.json()).error).toBe('SERVICE_UNAVAILABLE')
    })
  })
})
