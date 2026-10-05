import { vi } from 'vitest'

/** A fake Supabase auth error, shaped like AuthApiError. */
export function authError(status: number, code: string, message = code) {
  return { name: 'AuthApiError', status, code, message }
}

/** A fake Supabase client whose auth calls all succeed unless a test overrides them. */
export function fakeSupabase() {
  return {
    auth: {
      resetPasswordForEmail: vi.fn().mockResolvedValue({ data: {}, error: null }),
      verifyOtp: vi.fn().mockResolvedValue({ data: { session: { access_token: 't' }, user: {} }, error: null }),
      updateUser: vi.fn().mockResolvedValue({ data: { user: {} }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  }
}

export function postRequest(url: string, body: unknown, raw = false): Request {
  return new Request(`http://localhost:3000${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw ? (body as string) : JSON.stringify(body),
  })
}
