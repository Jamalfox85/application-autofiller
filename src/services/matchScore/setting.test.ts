import assert from 'node:assert/strict'
import test from 'node:test'
import { matchScoreIntent } from './intent.ts'
import { RESUME_MATCHING_DEFAULT, resumeMatchingEnabled } from './setting.ts'

const extraction = { text: 'We need TypeScript.', source: 'dom' as const, jobUrl: 'https://job.example/1' }

test('resume matching defaults on when nothing is stored', () => {
  assert.equal(RESUME_MATCHING_DEFAULT, true)
  assert.equal(resumeMatchingEnabled(undefined), true)
  assert.equal(resumeMatchingEnabled(null), true)
  assert.equal(resumeMatchingEnabled('false'), true)
})

test('resume matching follows the stored boolean', () => {
  assert.equal(resumeMatchingEnabled(true), true)
  assert.equal(resumeMatchingEnabled(false), false)
})

test('turning resume matching off skips scoring for Pro and free users', () => {
  const enabled = resumeMatchingEnabled(false)
  assert.equal(matchScoreIntent({ enabled, onboarding: false, extraction, isPro: true }), 'skip')
  assert.equal(matchScoreIntent({ enabled, onboarding: false, extraction, isPro: false }), 'skip')
})

test('leaving resume matching on keeps the Pro gate', () => {
  const enabled = resumeMatchingEnabled(true)
  assert.equal(matchScoreIntent({ enabled, onboarding: false, extraction, isPro: true }), 'score')
  assert.equal(matchScoreIntent({ enabled, onboarding: false, extraction, isPro: false }), 'locked')
})
