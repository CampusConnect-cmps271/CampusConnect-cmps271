import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/campus-assistant/route'
import { getCurrentUser } from '@/modules/auth'
import { log } from '@/modules/logging'
import { REGISTRAR_CHUNK, reply } from '@/modules/campus-assistant/fixtures'
import { postRequest } from '../helpers'

vi.mock('@/modules/logging', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/modules/auth', () => ({ getCurrentUser: vi.fn() }))
const { rpc, from } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ rpc, from })) }))

const URL = '/api/campus-assistant'
const KEY = 'sk-test-secret-key'
let nextUser = 0

/** The model API: embedContent answers with a vector, generateContent with the reply text. */
function modelReplies(text: string, status = 200, embeddingStatus = 200) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) =>
    String(url).includes(':embedContent')
      ? new Response(JSON.stringify({ embedding: { values: Array.from({ length: 768 }, () => 0.1) } }), { status: embeddingStatus })
      : new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status })))
}

/** The request body sent to the answer model (not to the embedding model). */
function answerRequestBody() {
  const call = vi.mocked(fetch).mock.calls.find(([url]) => String(url).includes(':generateContent'))
  return JSON.parse((call?.[1] as RequestInit).body as string)
}

beforeEach(() => {
  vi.clearAllMocks()
  rpc.mockImplementation(async (fn: string) => ({ data: fn === 'search_campus_chunks' ? [REGISTRAR_CHUNK] : [], error: null }))
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

  it('also searches by meaning when the question can be embedded', async () => {
    const res = await POST(postRequest(URL, { question: 'When does the library shut?' }) as never)

    expect(res.status).toBe(200)
    // 768 numbers, scaled to unit length by the embedding client.
    const vector = expect.stringMatching(/^\[0\.\d+(,0\.\d+){767}\]$/)
    expect(rpc).toHaveBeenCalledWith('search_campus_chunks_semantic', { p_embedding: vector, p_limit: 10 })
    expect(rpc).toHaveBeenCalledWith('search_campus_courses_semantic', { p_embedding: vector, p_limit: 10 })
    const embedCall = vi.mocked(fetch).mock.calls.find(([url]) => String(url).includes(':embedContent'))
    expect(JSON.parse((embedCall?.[1] as RequestInit).body as string).content.parts[0].text).toBe('When does the library shut?')
  })

  it('falls back to keyword search, logs a warning and still answers when embedding fails', async () => {
    modelReplies(reply('The Registrar issues transcripts.', ['registrar:0']), 200, 500)

    const res = await POST(postRequest(URL, { question: 'Who issues transcripts?' }) as never)

    expect(res.status).toBe(200)
    expect((await res.json()).citations).toHaveLength(1)
    expect(rpc).not.toHaveBeenCalledWith('search_campus_chunks_semantic', expect.anything())
    expect(log.warn).toHaveBeenCalledWith('campus_assistant.embedding_unavailable', expect.any(Object), expect.anything())
  })

  it('does not embed or call any model when the question has no searchable words', async () => {
    const res = await POST(postRequest(URL, { question: 'what is the' }) as never)

    expect(res.status).toBe(200)
    expect((await res.json()).insufficient_evidence).toBe(true)
    expect(fetch).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
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
    const sent = answerRequestBody()
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

/** Stands in for the student's own tables; `eqs` records every filter each query asked for. */
function studentData(rows: Record<string, unknown[] | { error: { code: string } }>) {
  const eqs: [string, string, unknown][] = []
  from.mockImplementation((table: string) => {
    const builder: Record<string, unknown> = {}
    for (const method of ['select', 'gte', 'order', 'limit', 'returns']) builder[method] = () => builder
    builder.eq = (column: string, value: unknown) => { eqs.push([table, column, value]); return builder }
    builder.then = (resolve: (value: unknown) => void) => {
      const answer = rows[table] ?? []
      resolve(Array.isArray(answer) ? { data: answer, error: null } : { data: null, error: answer.error })
    }
    return builder
  })
  return eqs
}

const PLAN_ID = '11111111-1111-4111-8111-111111111111'
const plan = {
  id: PLAN_ID,
  term: 'Fall 2026',
  starts_on: '2026-01-01',
  ends_on: '2099-12-20',
  plan_courses: [{ position: 1, courses: { code: 'CMPS 271', name: 'Software Engineering' }, plan_meetings: [{ weekday: 1, start_minute: 540, end_minute: 615 }] }],
  plan_items: [{ title: 'Dentist appointment', on_date: '2099-01-01', start_minute: null, end_minute: null }],
}

describe('POST /api/campus-assistant with the student\'s private context', () => {
  const ask = (question: string, history: unknown[] = []) => POST(postRequest(URL, { question, history }) as never)
  const sentToModel = () => answerRequestBody().contents[0].parts[0].text as string

  beforeEach(() => {
    from.mockReset()
    from.mockImplementation(() => { throw new Error('the private tables must not be read for this question') })
  })

  it('reads the student\'s plan for a personal question and lets the answer cite it', async () => {
    studentData({ semester_plans: [plan] })
    modelReplies(reply('You have CMPS 271 on Mondays.', [`me:plan:${PLAN_ID}`]))

    const res = await ask('What is on my schedule today?')

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.answer).toBe('You have CMPS 271 on Mondays.')
    expect(body.citations).toEqual([expect.objectContaining({ chunk_id: `me:plan:${PLAN_ID}`, url: `/planner/${PLAN_ID}` })])
    expect(sentToModel()).toContain(`<chunk id="me:plan:${PLAN_ID}">`)
    expect(sentToModel()).toContain('CMPS 271 Software Engineering: Mon 09:00-10:15')
  })

  it('does not read, or send, any private data for an ordinary question', async () => {
    const res = await ask('Who issues transcripts?')

    expect(res.status).toBe(200)
    expect(from).not.toHaveBeenCalled()
    expect(sentToModel()).not.toContain('me:')
  })

  it('asks every private query for the signed-in student\'s own rows', async () => {
    const eqs = studentData({})
    await ask('Which events did I save?')

    const me = (await vi.mocked(getCurrentUser).mock.results[0]?.value)?.id
    expect(me).toBeTruthy()
    expect(eqs).toContainEqual(['semester_plans', 'student_id', me])
    expect(eqs).toContainEqual(['saved_events', 'student_id', me])
    expect(eqs).toContainEqual(['saved_posts', 'user_id', me])
    expect(eqs).toContainEqual(['posts', 'author_id', me])
  })

  it('treats a vague follow-up to a personal question as personal', async () => {
    studentData({ semester_plans: [plan] })
    modelReplies(reply('Nothing else.', [`me:plan:${PLAN_ID}`]))

    const res = await ask('And tomorrow?', [{ question: 'What is on my schedule today?', answer: 'CMPS 271.' }])

    expect(res.status).toBe(200)
    expect(from).toHaveBeenCalledWith('semester_plans')
  })

  it('still answers from the shared sources, and logs only the part names, when private data cannot be read', async () => {
    studentData({ semester_plans: { error: { code: 'SECRET-DB-ERROR' } } })
    modelReplies(reply('The Registrar issues transcripts.', ['registrar:0']))

    const res = await ask('What is my plan for transcripts?')

    expect(res.status).toBe(200)
    expect(log.warn).toHaveBeenCalledWith('campus_assistant.context_unavailable', { sections: ['plan'] }, expect.anything())
    expect(JSON.stringify(vi.mocked(log.warn).mock.calls)).not.toContain('SECRET-DB-ERROR')
  })

  it('never logs what the student typed into their plan, or the question', async () => {
    studentData({ semester_plans: [plan] })
    modelReplies(reply('You have a dentist appointment.', [`me:plan:${PLAN_ID}`]))

    await ask('When is my dentist appointment this week?')

    const logged = JSON.stringify([log.info, log.warn, log.error].map((fn) => vi.mocked(fn).mock.calls))
    expect(logged).not.toContain('Dentist')
    expect(logged).not.toContain('dentist')
    expect(logged).toContain('campus_assistant.answered')
  })
})
