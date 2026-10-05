import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseAuthClient, SupabaseNotConfiguredError } from './auth-client'

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:3101')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test_only')
})
afterEach(() => vi.unstubAllEnvs())

describe('request-scoped password recovery client', () => {
  it('keeps recovery sessions in memory and isolates callers', () => {
    const first = { auth: { session: 'test-recovery-session' } }
    const second = { auth: { session: null } }
    vi.mocked(createClient).mockReturnValueOnce(first as never).mockReturnValueOnce(second as never)
    expect(createSupabaseAuthClient()).toBe(first)
    expect(createSupabaseAuthClient()).toBe(second)
    expect(createClient).toHaveBeenCalledTimes(2)
    expect(createClient).toHaveBeenCalledWith('http://127.0.0.1:3101', 'sb_publishable_test_only', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  })

  it.each(['', 'sb_secret_test_only'])('rejects missing or privileged browser configuration: %s', (key) => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', key)
    expect(() => createSupabaseAuthClient()).toThrow(SupabaseNotConfiguredError)
    expect(createClient).not.toHaveBeenCalled()
  })
})
