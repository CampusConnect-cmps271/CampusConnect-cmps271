import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/campus-assistant/route'
import { getCurrentUser } from '@/modules/auth'
import { log } from '@/modules/logging'
import { REGISTRAR_CHUNK, reply } from '@/modules/campus-assistant/fixtures'
import { postRequest } from '../helpers'

vi.mock('@/modules/logging', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/modules/auth', () => ({ getCurrentUser: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ rpc: vi.fn(async (fn: string) => ({ data: fn === 'search_campus_chunks' ? [REGISTRAR_CHUNK] : [], error: null })) })),
}))

const URL = '/api/campus-assistant'
const KEY = 'sk-test-secret-key'
let nextUser = 0

function modelReplies(text: string, status = 200) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status })))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  vi.stubEnv('GEMINI_API_KEY', KEY)
  // A fresh user per test, so the in-memory rate limit does not carry over.
  nextUser += 1
  vi.mocked(getCurrentUser).mockResolvedValue({ id: `user-${nextUser}`, email: null, name: 'Student' })
  modelReplies(reply('The Registrar issues transcripts.', ['registrar:0']))
})

describe('POST /api/campus-assistant', () => {
  it('answers with citations built from stored sources', async () => {
    const res = await POST(postRequest(URL, { question: 'Who issues transcripts?' }) as never)

    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const body = await res.json()
    expect(body.answer).toBe('The Registrar issues transcripts.')
    expect(body.citations).toEqual([expect.objectContaining({ chunk_id: 'registrar:0', url: REGISTRAR_CHUNK.url })])
  })

  it('requires a signed-in student', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null)
    expect((await POST(postRequest(URL, { question: 'Who issues transcripts?' }) as never)).status).toBe(401)
  })

  it('refuses cross-site requests', async () => {
    const request = postRequest(URL, { question: 'Who issues transcripts?' })
    request.headers.set('sec-fetch-site', 'cross-site')
    expect((await POST(request as never)).status).toBe(403)
  })

  it.each([
    ['too short', { question: 'a' }],
    ['too long', { question: 'x'.repeat(501) }],
    ['not a string', { question: 42 }],
    ['missing', {}],
  ])('rejects a question that is %s', async (_name, body) => {
    expect((await POST(postRequest(URL, body) as never)).status).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects malformed JSON and oversized bodies before calling the provider', async () => {
    expect((await POST(postRequest(URL, '{nope', true) as never)).status).toBe(400)
    expect((await POST(postRequest(URL, { question: 'a'.repeat(20000) }) as never)).status).toBe(413)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('accepts a follow-up with earlier turns and sends them to the provider as history', async () => {
    const history = [{ question: 'How do I request a transcript?', answer: 'Use the online form.' }]
    const res = await POST(postRequest(URL, { question: 'And how long does it take?', history }) as never)

    expect(res.status).toBe(200)
    const sent = JSON.parse((vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit).body as string)
    expect(sent.contents[0].parts[0].text).toContain('<history>')
    expect(sent.contents[0].parts[0].text).toContain('Use the online form.')
  })

  it.each([
    ['too many turns', Array.from({ length: 4 }, () => ({ question: 'abc', answer: 'x' }))],
    ['an overlong answer', [{ question: 'abc', answer: 'x'.repeat(601) }]],
    ['a malformed turn', [{ question: 'abc' }]],
    ['not a list', 'hello'],
  ])('rejects history with %s', async (_name, history) => {
    expect((await POST(postRequest(URL, { question: 'And more?', history }) as never)).status).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rate limits one student after ten questions', async () => {
    for (let n = 0; n < 10; n += 1) expect((await POST(postRequest(URL, { question: 'Who issues transcripts?' }) as never)).status).toBe(200)
    const res = await POST(postRequest(URL, { question: 'Who issues transcripts?' }) as never)
    expect(res.status).toBe(429)
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0)
  })

  it('answers 503 and logs when the provider key is missing, without calling the provider', async () => {
    vi.stubEnv('GEMINI_API_KEY', '')
    const res = await POST(postRequest(URL, { question: 'Who issues transcripts?' }) as never)

    expect(res.status).toBe(503)
    expect(fetch).not.toHaveBeenCalled()
    expect(log.error).toHaveBeenCalledWith('campus_assistant.failed', expect.objectContaining({ kind: 'not_configured' }), expect.anything())
  })

  it('answers 504 on a provider timeout and 503 on an outage', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw Object.assign(new Error('t'), { name: 'TimeoutError' }) }))
    expect((await POST(postRequest(URL, { question: 'Who issues transcripts?' }) as never)).status).toBe(504)

    modelReplies('{}', 500)
    expect((await POST(postRequest(URL, { question: 'Who issues transcripts?' }) as never)).status).toBe(503)
  })

  it('never logs the question or the provider key', async () => {
    const question = 'My private question about transcripts'
    await POST(postRequest(URL, { question }) as never)
    modelReplies('{}', 500)
    await POST(postRequest(URL, { question }) as never)

    const logged = JSON.stringify([log.info, log.warn, log.error].map((fn) => vi.mocked(fn).mock.calls))
    expect(logged).not.toContain('private question')
    expect(logged).not.toContain(KEY)
  })
})
