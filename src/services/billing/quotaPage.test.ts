import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { decideQuotaClaim, forgetQuotaClaim, quotaPageKey } from './quotaPage.ts'

const page = 'https://boards.greenhouse.io/acme/jobs/123?gh_jid=123'

test('quota page key ignores the hash and keeps the job query', () => {
  assert.equal(quotaPageKey(`${page}#step-2`), page)
  assert.equal(quotaPageKey('https://boards.greenhouse.io/other/jobs/9'), 'https://boards.greenhouse.io/other/jobs/9')
  assert.equal(quotaPageKey('chrome://extensions'), '')
  assert.equal(quotaPageKey(''), '')
})

test('the same page is claimed once per week, including a second frame', () => {
  const first = decideQuotaClaim({}, page, '2026-W41')
  assert.equal(first.claimed, true)
  const second = decideQuotaClaim(first.claims, page, '2026-W41')
  assert.equal(second.claimed, false)
  assert.equal(second.claims[page], '2026-W41')
})

test('the service worker serializes the claim and the build emits it', () => {
  const background = readFileSync(new URL('../../../background.js', import.meta.url), 'utf8')
  const emit = readFileSync(new URL('../../../scripts/emit-install-attribution.mjs', import.meta.url), 'utf8')
  assert.equal(background.includes("request.action === 'claimFillQuota'"), true)
  assert.equal(background.includes('enqueueQuotaClaim'), true)
  assert.equal(background.includes('./src/services/billing/quotaPage.js'), true)
  assert.equal(emit.includes('src/services/billing/quotaPage.ts'), true)
})

test('a new week can charge the same page again, and a failed commit releases it', () => {
  const first = decideQuotaClaim({ [page]: '2026-W40', 'https://old.example/job': '2026-W40' }, page, '2026-W41')
  assert.equal(first.claimed, true)
  assert.equal(first.claims['https://old.example/job'], undefined)
  const released = forgetQuotaClaim(first.claims, page)
  assert.equal(released[page], undefined)
  assert.equal(decideQuotaClaim(released, page, '2026-W41').claimed, true)
})
