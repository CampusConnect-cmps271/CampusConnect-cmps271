import { describe, expect, it } from 'vitest'
import { maskEmail } from '@/lib/auth/password-reset'
import { validateCode, validateEmail, validateNewPassword } from '@/lib/validation'

describe('validation helpers', () => {
  it('accepts a well-formed email and trims whitespace', () => {
    expect(validateEmail('  student@mail.aub.edu ')).toBeUndefined()
  })

  it('accepts codes of 6 to 10 digits only', () => {
    expect(validateCode('123456')).toBeUndefined()
    expect(validateCode('1234567890')).toBeUndefined()
    expect(validateCode('12345')).toBeTruthy()
    expect(validateCode('12345678901')).toBeTruthy()
  })

  it('accepts a password that meets every rule', () => {
    expect(validateNewPassword('Campus#2026')).toBeUndefined()
  })

  it('lists every rule a password fails', () => {
    expect(validateNewPassword('abc')).toMatch(/at least 8 characters.*uppercase.*number.*symbol/)
  })

  it('rejects passwords longer than 72 characters', () => {
    expect(validateNewPassword(`Aa1!${'x'.repeat(70)}`)).toMatch(/at most 72/)
  })

  it('masks emails in logs', () => {
    expect(maskEmail('student@mail.aub.edu')).toBe('st***@mail.aub.edu')
  })
})
