import assert from 'node:assert/strict'
import test from 'node:test'
import { buildMatchProfile } from './profile.ts'
import { matchScoreRequestBody, parseMatchScoreBody, postMatchScore, postMatchScoreDecline } from './contract.ts'
import { cloneDefaultPersonalInfo } from '../../lib/personalInfoDefaults.ts'

const scored = {
  status: 'scored',
  score: 82,
  band: 'very_strong',
  confidence: 'high',
  strong_match: false,
  matched: [
    { label: 'TypeScript', kind: 'must' },
    { label: 'Extra', kind: 'nice' },
    { label: 'Third', kind: 'must' },
    { label: 'Fourth', kind: 'nice' },
  ],
  suggestions: [
    { id: '1', kind: 'must', text: 'Gap', quick_answer: { skill: 'GraphQL', question: 'Do you have experience with GraphQL?' } },
    { id: '2', kind: 'years', text: 'How many years of Go?', quick_answer: { skill: 'Go', question: 'Should not ask' } },
    { id: '3', kind: 'education', text: 'A CS degree is listed.' },
    { id: '4', kind: 'nice', text: 'Dropped' },
  ],
  dealbreakers: [
    { type: 'sponsorship', text: 'Sponsorship is required.' },
    { type: 'onsite', text: 'Ignore this type.' },
  ],
  notices: [
    { type: 'clearance', text: 'A clearance is listed.' },
    { type: 'license', text: 'A license is listed.' },
  ],
  score_version: 1,
  requirements_version: 1,
  cached_requirements: true,
}

test('parse keeps the frozen scored shape and drops unknown enums', () => {
  const result = parseMatchScoreBody(200, scored)
  assert.equal(result.kind, 'scored')
  if (result.kind !== 'scored') return
  assert.equal(result.score.strong_match, false)
  assert.equal(result.score.matched.length, 3)
  assert.equal(result.score.suggestions.length, 3)
  assert.deepEqual(result.score.suggestions[0].quick_answer, {
    skill: 'GraphQL',
    question: 'Do you have experience with GraphQL?',
  })
  assert.equal(result.score.suggestions[1].quick_answer, undefined)
  assert.equal(result.score.suggestions[2].quick_answer, undefined)
  assert.deepEqual(result.score.dealbreakers, [{ type: 'sponsorship', text: 'Sponsorship is required.' }])
  assert.equal(result.score.notices.length, 2)
  assert.equal(result.score.score_version, 1)
})

test('strong_match is copied and not recomputed from the score', () => {
  const low = parseMatchScoreBody(200, { ...scored, score: 40, strong_match: true, suggestions: [], dealbreakers: [] })
  const high = parseMatchScoreBody(200, { ...scored, score: 96, strong_match: false })
  assert.equal(low.kind === 'scored' && low.score.strong_match, true)
  assert.equal(high.kind === 'scored' && high.score.strong_match, false)
})

test('insufficient, unsupported, plan_required, and rate limit map to their kinds', () => {
  assert.deepEqual(parseMatchScoreBody(200, { status: 'insufficient_profile', missing: ['skills', 'nope'] }), {
    kind: 'insufficient_profile',
    missing: ['skills'],
  })
  assert.deepEqual(parseMatchScoreBody(200, { status: 'unsupported', reason: 'jd_too_short' }), {
    kind: 'unsupported',
    reason: 'jd_too_short',
  })
  assert.equal(parseMatchScoreBody(200, { status: 'unsupported', reason: 'other' }).kind, 'hide')
  assert.equal(
    parseMatchScoreBody(403, { success: false, error: { code: 'plan_required' } }).kind,
    'plan_required',
  )
  assert.equal(parseMatchScoreBody(429, { status: 'rate_limited' }).kind, 'rate_limited')
  assert.equal(parseMatchScoreBody(503, {}).kind, 'hide')
})

test('POST /match-score sends only the contract body and stops at 8s', async () => {
  const bodies: string[] = []
  let calls = 0
  const profile = buildMatchProfile({
    ...cloneDefaultPersonalInfo(),
    email: 'person@example.com',
    skills: ['TypeScript'],
    city: 'Austin',
  })
  const result = await postMatchScore({
    body: matchScoreRequestBody({
      jobUrl: 'https://job-boards.greenhouse.io/acme/jobs/1',
      ats: 'greenhouse',
      jdText: `${'word '.repeat(10_000)}tail`,
      jdSource: 'fetched',
      profile,
    }),
    token: 'token-1',
    baseUrl: 'http://127.0.0.1:9/api/v1',
    apiKey: null,
    timeoutMs: 20,
    fetchImpl: async (_url, init) => {
      calls += 1
      bodies.push(String(init?.body))
      assert.equal(init?.method, 'POST')
      const headers = init?.headers as Record<string, string>
      assert.equal(headers.Authorization, 'Bearer token-1')
      assert.equal(String(_url), 'http://127.0.0.1:9/api/v1/match-score')
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })
    },
  })
  assert.equal(result.kind, 'hide')
  assert.equal(calls, 1)
  const sent = JSON.parse(bodies[0])
  assert.deepEqual(Object.keys(sent).sort(), ['ats', 'jd_source', 'jd_text', 'job_url', 'profile'])
  assert.equal(sent.jd_text.length, 30_000)
  assert.equal(JSON.stringify(sent.profile).includes('person@example.com'), false)
})

test('decline routes send {skill} and accept 204', async () => {
  const calls: Array<{ method: string; body: string; url: string }> = []
  const fetchImpl: typeof fetch = async (url, init) => {
    calls.push({ method: String(init?.method), body: String(init?.body), url: String(url) })
    return new Response(null, { status: 204 })
  }
  const posted = await postMatchScoreDecline({
    skill: 'GraphQL',
    method: 'POST',
    token: 'token-1',
    baseUrl: 'http://127.0.0.1:9/api/v1',
    fetchImpl,
  })
  const removed = await postMatchScoreDecline({
    skill: 'GraphQL',
    method: 'DELETE',
    token: 'token-1',
    baseUrl: 'http://127.0.0.1:9/api/v1',
    fetchImpl,
  })
  assert.equal(posted.ok, true)
  assert.equal(removed.ok, true)
  assert.deepEqual(JSON.parse(calls[0].body), { skill: 'GraphQL' })
  assert.equal(calls[0].method, 'POST')
  assert.equal(calls[1].method, 'DELETE')
  assert.match(calls[0].url, /\/match-score\/decline$/)
})
