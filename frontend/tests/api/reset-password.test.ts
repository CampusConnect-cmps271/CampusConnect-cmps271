import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/auth/reset-password/route'
import { createSupabaseAuthClient, SupabaseNotConfiguredError } from '@/lib/supabase/auth-client'
import { log } from '@/modules/logging'
import { authError, fakeSupabase, postRequest } from '../helpers'

// The real logger is server-only and writes to Supabase; record calls instead.
vi.mock('@/modules/logging', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/supabase/auth-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/supabase/auth-client')>()),
  createSupabaseAuthClient: vi.fn(),
}))

const URL = '/api/auth/reset-password'
const VALID = {
  email: 'student@mail.aub.edu',
  code: '12345678', // the team's project sends 8-digit codes (supabase/config.toml)
  newPassword: 'NewPass#2026',
  confirmPassword: 'NewPass#2026',
}
let supabase: ReturnType<typeof fakeSupabase>

beforeEach(() => {
  vi.clearAllMocks()
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
        token: '12345678',
        type: 'recovery',
      })
      expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'NewPass#2026' })
      expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'global' })
      expect(supabase.auth.verifyOtp.mock.invocationCallOrder[0]).toBeLessThan(supabase.auth.updateUser.mock.invocationCallOrder[0])
      expect(supabase.auth.updateUser.mock.invocationCallOrder[0]).toBeLessThan(supabase.auth.signOut.mock.invocationCallOrder[0])
      expect(res.headers.get('set-cookie')).toBeNull()
    })

    it('normalizes email and code without changing the chosen password', async () => {
      const password = '  NewPass#2026  '
      const res = await POST(postRequest(URL, {
        ...VALID, email: ' STUDENT@MAIL.AUB.EDU ', code: ' 01234567 ',
        newPassword: password, confirmPassword: password,
      }))

      expect(res.status).toBe(200)
      expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({
        email: 'student@mail.aub.edu', token: '01234567', type: 'recovery',
      })
      expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password })
    })

    it('logs the completed reset without the code or the password', async () => {
      supabase.auth.verifyOtp.mockResolvedValue({
        data: { session: { access_token: 't' }, user: { id: 'user-1' } },
        error: null,
      })

      await POST(postRequest(URL, VALID))

      expect(log.info).toHaveBeenCalledWith(
        'auth.password_reset.completed',
        { email: 'student@mail.aub.edu' },
        { userId: 'user-1' },
      )
      const everyLogCall = JSON.stringify([
        vi.mocked(log.info).mock.calls,
        vi.mocked(log.warn).mock.calls,
        vi.mocked(log.error).mock.calls,
      ])
      expect(everyLogCall).not.toContain(VALID.code)
      expect(everyLogCall).not.toContain(VALID.newPassword)
    })

    it('still succeeds if revoking old sessions fails', async () => {
      supabase.auth.signOut.mockResolvedValue({ error: authError(500, 'unexpected_failure') })

      const res = await POST(postRequest(URL, VALID))

      expect(res.status).toBe(200)
      expect(log.warn).toHaveBeenCalledWith('auth.password_reset.revoke_failed',
        { code: 'unexpected_failure', status: 500 }, { userId: null })
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
      ['password whose only symbol is a space', { ...VALID, newPassword: 'New Pass2026', confirmPassword: 'New Pass2026' }, 'newPassword'],
      ['password longer than 72 characters', { ...VALID, newPassword: `Aa1!${'x'.repeat(70)}`, confirmPassword: `Aa1!${'x'.repeat(70)}` }, 'newPassword'],
      ['8-digit code with letters', { ...VALID, code: '1234567a' }, 'code'],
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

    it.each([null, [], 'not an object', 42])('rejects a non-object JSON body: %j', async (body) => {
      const res = await POST(postRequest(URL, body))
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('INVALID_JSON')
      expect(supabase.auth.verifyOtp).not.toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('refuses to update a password when verification returns no session', async () => {
      supabase.auth.verifyOtp.mockResolvedValue({ data: { session: null, user: null }, error: null })
      const res = await POST(postRequest(URL, VALID))
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('INVALID_OR_EXPIRED_CODE')
      expect(supabase.auth.updateUser).not.toHaveBeenCalled()
      expect(supabase.auth.signOut).not.toHaveBeenCalled()
    })

    it.each([500, 504, 0])('maps verification failure %s to a safe service error', async (status) => {
      supabase.auth.verifyOtp.mockResolvedValue({
        data: { session: null, user: null }, error: authError(status, 'request_timeout', 'private provider detail'),
      })
      const res = await POST(postRequest(URL, VALID))
      expect(res.status).toBe(503)
      expect(await res.json()).toMatchObject({ error: 'SERVICE_UNAVAILABLE' })
      expect(supabase.auth.updateUser).not.toHaveBeenCalled()
      expect(supabase.auth.signOut).not.toHaveBeenCalled()
    })

    it('returns a controlled configuration error before any Auth call', async () => {
      vi.mocked(createSupabaseAuthClient).mockImplementation(() => { throw new SupabaseNotConfiguredError() })
      const res = await POST(postRequest(URL, VALID))
      expect(res.status).toBe(503)
      expect((await res.json()).error).toBe('SERVICE_UNAVAILABLE')
      expect(supabase.auth.verifyOtp).not.toHaveBeenCalled()
    })

    it('does not sign out or report success when the update is throttled', async () => {
      supabase.auth.updateUser.mockResolvedValue({ data: null, error: authError(429, 'over_request_rate_limit') })
      const res = await POST(postRequest(URL, VALID))
      expect(res.status).toBe(429)
      expect((await res.json()).error).toBe('RATE_LIMITED')
      expect(supabase.auth.signOut).not.toHaveBeenCalled()
      expect(log.info).not.toHaveBeenCalledWith('auth.password_reset.completed', expect.anything(), expect.anything())
    })

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
