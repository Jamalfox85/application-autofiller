import assert from 'node:assert/strict'
import test from 'node:test'
import { cloneDefaultPersonalInfo } from '../../lib/personalInfoDefaults.ts'
import { fulfillMatchScore, willRequestMatchScore } from './fulfill.ts'
import { matchScoreIntent } from './intent.ts'
import { buildMatchProfile } from './profile.ts'

const profile = buildMatchProfile({ ...cloneDefaultPersonalInfo(), skills: ['TypeScript'], city: 'Austin' })

function input(overrides: Record<string, unknown> = {}) {
  return {
    isPro: true,
    dismissed: false,
    rateLimited: false,
    rescore: false,
    cached: null,
    now: 1_000,
    token: 'token-1',
    jobUrl: 'https://jobs.ashbyhq.com/ashby/7458d4e9-da2e-47bd-98cb-adfda43d42b2/application',
    ats: 'ashby' as const,
    jdText: 'Build product surfaces for hiring teams.',
    jdSource: 'fetched' as const,
    profile,
    baseUrl: 'http://127.0.0.1:9/api/v1',
    apiKey: 'test-key',
    ...overrides,
  }
}

test('a missing job description and a free user never call Match Score', async () => {
  assert.equal(
    matchScoreIntent({ enabled: true, onboarding: false, extraction: null, isPro: true }),
    'skip',
  )
  assert.equal(
    matchScoreIntent({
      enabled: true,
      onboarding: false,
      extraction: { text: 'A real description', source: 'dom', jobUrl: 'https://example.com/job' },
      isPro: false,
    }),
    'locked',
  )
  assert.equal(willRequestMatchScore({ ...input(), jdText: '' }), false)
  assert.equal(willRequestMatchScore({ ...input(), isPro: false }), false)

  let calls = 0
  const fetchImpl: typeof fetch = async () => {
    calls += 1
    throw new Error('match-score should not be called')
  }
  const missing = await fulfillMatchScore(input({ jdText: '   ', fetchImpl }))
  const free = await fulfillMatchScore(input({ isPro: false, fetchImpl }))
  const unsigned = await fulfillMatchScore(input({ token: null, fetchImpl }))
  const noKey = await fulfillMatchScore(input({ apiKey: null, fetchImpl }))
  assert.equal(missing.relay.view, 'hide')
  assert.equal(free.relay.view, 'locked')
  assert.equal(unsigned.relay.view, 'hide')
  assert.equal(noKey.relay.view, 'hide')
  assert.equal(missing.requested, false)
  assert.equal(free.requested, false)
  assert.equal(unsigned.requested, false)
  assert.equal(noKey.requested, false)
  assert.equal(willRequestMatchScore(input({ apiKey: '' })), false)
  assert.equal(calls, 0)
})

test('429 hides a first score and a re-score is not stored as rate limited', async () => {
  const envelope = JSON.stringify({ success: false, error: { code: 'rate_limited', message: 'Slow down' } })
  const fetchImpl: typeof fetch = async () => new Response(envelope, { status: 429 })
  const first = await fulfillMatchScore(input({ fetchImpl }))
  const again = await fulfillMatchScore(input({ fetchImpl, rescore: true, rateLimited: true }))
  assert.equal(first.relay.view, 'hide')
  assert.equal(first.persistRateLimit, true)
  assert.equal(again.relay.view, 'keep')
  assert.equal(again.persistRateLimit, false)
  assert.equal(willRequestMatchScore(input({ rateLimited: true })), false)
  assert.equal(willRequestMatchScore(input({ rateLimited: true, rescore: true })), true)
})

test('a 5xx is a single hide with no retry', async () => {
  let calls = 0
  const fetchImpl: typeof fetch = async () => {
    calls += 1
    return new Response('nope', { status: 500 })
  }
  const result = await fulfillMatchScore(input({ fetchImpl }))
  assert.equal(result.relay.view, 'hide')
  assert.equal(result.cacheValue, null)
  assert.equal(calls, 1)
})

test('the same job and profile uses the cache', async () => {
  let calls = 0
  const fetchImpl: typeof fetch = async () => {
    calls += 1
    throw new Error('cached')
  }
  const result = await fulfillMatchScore(
    input({
      fetchImpl,
      cached: {
        at: 500,
        result: {
          kind: 'scored',
          score: {
            status: 'scored',
            score: 70,
            band: 'good',
            confidence: 'low',
            strong_match: false,
            matched: [],
            suggestions: [],
            dealbreakers: [],
            notices: [],
            score_version: 1,
            requirements_version: 1,
            cached_requirements: true,
          },
        },
      },
    }),
  )
  assert.equal(result.relay.view, 'scored')
  if (result.relay.view === 'scored') assert.equal(result.relay.cached, true)
  assert.equal(calls, 0)
})

test('401 and plan_required hide and are not scores', async () => {
  const scoredBody = JSON.stringify({
    status: 'scored',
    score: 90,
    band: 'very_strong',
    confidence: 'high',
    strong_match: true,
    matched: [],
    suggestions: [],
    dealbreakers: [],
    notices: [],
    score_version: 1,
    requirements_version: 1,
    cached_requirements: false,
  })
  let calls = 0
  const unauthorized = await fulfillMatchScore(
    input({
      fetchImpl: async () => {
        calls += 1
        return new Response(scoredBody, { status: 401 })
      },
    }),
  )
  const plan = await fulfillMatchScore(
    input({
      fetchImpl: async () => {
        calls += 1
        return new Response(JSON.stringify({ success: false, error: { code: 'plan_required' } }), { status: 403 })
      },
    }),
  )
  assert.equal(unauthorized.relay.view, 'hide')
  assert.equal(plan.relay.view, 'hide')
  assert.equal(unauthorized.cacheValue, null)
  assert.equal(plan.cacheValue, null)
  assert.equal(calls, 2)
})
