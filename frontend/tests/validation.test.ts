import { describe, expect, it } from 'vitest'
import { validateCode, validateEmail, validateNewPassword } from '@/lib/validation'

describe('validation helpers', () => {
  it('accepts a well-formed email and trims whitespace', () => {
    expect(validateEmail('  student@mail.aub.edu ')).toBeUndefined()
  })

  it("accepts codes of 6 to 10 digits, including the project's 8-digit codes", () => {
    expect(validateCode('123456')).toBeUndefined()
    expect(validateCode('12345678')).toBeUndefined()
    expect(validateCode('1234567890')).toBeUndefined()
    expect(validateCode('12345')).toBeTruthy()
    expect(validateCode('12345678901')).toBeTruthy()
  })

  it('accepts a password that meets every rule', () => {
    expect(validateNewPassword('Campus#2026')).toBeUndefined()
  })

  it('lists every rule a password fails, using the shared policy wording', () => {
    expect(validateNewPassword('abc')).toMatch(/at least 8 characters.*uppercase.*digit.*symbol/)
  })

  it('does not count a space as a symbol, matching Supabase Auth', () => {
    expect(validateNewPassword('Campus 2026')).toMatch(/symbol/)
  })

  it('rejects passwords longer than 72 characters', () => {
    expect(validateNewPassword(`Aa1!${'x'.repeat(70)}`)).toMatch(/at most 72/)
  })
})
