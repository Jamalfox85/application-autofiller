import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import { cloneDefaultPersonalInfo } from '../lib/personalInfoDefaults.ts'
import { ACTIVE_PROFILE_KEY, PERSONAL_INFO_KEY } from '../lib/sync/activeProfile.ts'
import { ENTITLEMENT_KEY } from '../services/billing/entitlementStore.ts'

// Hosted Greenhouse job page with a description in the DOM, so scoring does not need a fetch.
const dom = new JSDOM(
  '<!doctype html><html><body><div class="job__description">Build distributed systems with Go and TypeScript.</div></body></html>',
  { url: 'https://job-boards.greenhouse.io/greenhouse/jobs/8234044' },
)

const previous = {
  window: globalThis.window,
  document: globalThis.document,
  chrome: (globalThis as { chrome?: unknown }).chrome,
}

Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
})

function installChrome(initial: Record<string, unknown>) {
  const data: Record<string, unknown> = {
    [ENTITLEMENT_KEY]: { isPro: true, plan: 'monthly', updatedAt: 1 },
    ...initial,
  }
  const messages: Array<Record<string, unknown>> = []
  const chromeStub = {
    storage: {
      local: {
        async get(keys: string | string[] | null) {
          if (keys == null) return { ...data }
          const list = Array.isArray(keys) ? keys : [keys]
          return Object.fromEntries(list.filter((key) => key in data).map((key) => [key, data[key]]))
        },
        async set(items: Record<string, unknown>) {
          Object.assign(data, items)
        },
        async remove(keys: string | string[]) {
          for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key]
        },
      },
      onChanged: { addListener() {}, removeListener() {} },
    },
    runtime: {
      async sendMessage(message: Record<string, unknown>) {
        messages.push(message)
        return { ok: true, body: '' }
      },
      getManifest() {
        return { version: '2.0.0' }
      },
    },
  }
  Object.assign(globalThis, { chrome: chromeStub })
  return messages
}

test.after(() => {
  Object.assign(globalThis, previous)
})

test('Match Score runOnce proceeds when setup is complete', async () => {
  const messages = installChrome({ profileSetupCompletedAt: 1_700_000_000_000 })
  const { resetMatchScoreForTests, runOnce } = await import('./matchScore.ts')
  resetMatchScoreForTests()
  await runOnce()
  const scored = messages.find((message) => message.action === 'matchScore')
  assert.ok(scored)
  assert.equal(scored.ats, 'greenhouse')
  assert.match(String(scored.jdText), /TypeScript/)
  assert.equal(messages.some((message) => message.action === 'fetchJobPosting'), false)
})

test('Match Score runOnce proceeds when profiles exist even without profileSetupCompletedAt', async () => {
  const messages = installChrome({
    [ACTIVE_PROFILE_KEY]: { id: 'copy', name: 'Primary copy', profileCount: 3 },
    [PERSONAL_INFO_KEY]: { ...cloneDefaultPersonalInfo(), firstName: '', lastName: '' },
    profileSetupSession: { id: 'leftover', startedAt: 1 },
  })
  const { resetMatchScoreForTests, runOnce } = await import('./matchScore.ts')
  resetMatchScoreForTests()
  await runOnce()
  assert.equal(messages.some((message) => message.action === 'matchScore'), true)
})

test('Match Score runOnce stays quiet on first-run onboarding', async () => {
  const messages = installChrome({
    [ACTIVE_PROFILE_KEY]: { id: 'primary', name: 'Primary', profileCount: 1 },
    [PERSONAL_INFO_KEY]: { ...cloneDefaultPersonalInfo(), email: 'new@example.com' },
    profileSetupSession: { id: 'onboarding', startedAt: 1 },
  })
  const { resetMatchScoreForTests, runOnce } = await import('./matchScore.ts')
  resetMatchScoreForTests()
  await runOnce()
  assert.deepEqual(messages, [])
})
