import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  attributionFromLanding,
  attributionFromTabUrls,
  attributionFromUrl,
  installSourceProperties,
  canEnrichInstallSource,
  isFirstRunWindowOpen,
  mergeInstallSource,
  referrerOrigin,
  sanitizeAttributionValue,
} from './installAttribution.ts'

const storeUrl =
  'https://chromewebstore.google.com/detail/gofillr/abc?utm_source=newsletter&utm_medium=email&utm_campaign=spring&utm_content=hero&utm_term=autofill&campaign=spring_launch&email=person@example.com&gclid=secret-click'

test('store listing query params become utm and campaign fields', () => {
  const fields = attributionFromUrl(storeUrl)
  assert.deepEqual(fields, {
    utm_source: 'newsletter',
    utm_medium: 'email',
    utm_campaign: 'spring',
    utm_content: 'hero',
    utm_term: 'autofill',
    campaign: 'spring_launch',
  })
})

test('emails, click ids, and raw urls are not attribution', () => {
  assert.equal(sanitizeAttributionValue('person@example.com'), undefined)
  assert.equal(sanitizeAttributionValue('https://example.com/path?token=1'), undefined)
  assert.equal(sanitizeAttributionValue('a'.repeat(101)), undefined)
  const fields = attributionFromUrl(
    'https://gofillr.com/?utm_source=person@example.com&gclid=abc&fbclid=xyz&utm_medium=cpc',
  )
  assert.deepEqual(fields, { utm_medium: 'cpc' })
})

test('referrer is reduced to an origin', () => {
  assert.equal(
    referrerOrigin('https://news.ycombinator.com/item?id=1&email=person@example.com'),
    'https://news.ycombinator.com',
  )
  assert.equal(referrerOrigin('chrome-extension://abc/popup.html'), undefined)
  const fields = attributionFromUrl('https://gofillr.com/?referrer=https://www.google.com/search?q=secret')
  assert.equal(fields.referrer, 'https://www.google.com')
  const token = attributionFromUrl('https://gofillr.com/?referrer=newsletter')
  assert.equal(token.referrer, 'newsletter')
})

test('hash campaigns are read when the query string has none', () => {
  const fields = attributionFromUrl('https://www.gofillr.com/welcome#utm_source=twitter&utm_campaign=launch')
  assert.equal(fields.utm_source, 'twitter')
  assert.equal(fields.utm_campaign, 'launch')
})

test('landing capture ignores job applications and same-origin referrers', () => {
  const job = attributionFromLanding(
    'https://boards.greenhouse.io/acme/jobs/1?utm_source=linkedin&email=person@example.com',
    'https://www.google.com/search?q=acme',
  )
  assert.deepEqual(job, {})

  const sameOrigin = attributionFromLanding('https://gofillr.com/?utm_source=site', 'https://gofillr.com/blog')
  assert.deepEqual(sameOrigin, { utm_source: 'site' })

  const landing = attributionFromLanding(
    'https://www.gofillr.com/',
    'https://www.google.com/search?q=gofillr',
  )
  assert.deepEqual(landing, { referrer: 'https://www.google.com' })
})

test('a store listing beats an inactive landing tab, and job-site urls are ignored', () => {
  const fields = attributionFromTabUrls([
    {
      url: 'https://boards.greenhouse.io/acme?utm_source=should-ignore&email=person@example.com',
      active: true,
    },
    {
      url: 'https://gofillr.com/?utm_source=landing&utm_campaign=from-site',
      active: false,
    },
    {
      url: 'https://chromewebstore.google.com/detail/gofillr/abc?utm_source=store&utm_campaign=from-store',
      active: false,
    },
  ])
  assert.equal(fields.utm_source, 'store')
  assert.equal(fields.utm_campaign, 'from-store')
  assert.equal(fields.utm_medium, undefined)
})

test('an active landing tab wins over an inactive store tab', () => {
  const fields = attributionFromTabUrls([
    {
      url: 'https://chromewebstore.google.com/detail/gofillr/abc?utm_source=store',
      active: false,
    },
    {
      url: 'https://gofillr.com/?utm_source=landing&utm_medium=cpc',
      active: true,
    },
  ])
  assert.equal(fields.utm_source, 'landing')
  assert.equal(fields.utm_medium, 'cpc')
})

test('merge keeps the first value and drops empty install bookkeeping from properties', () => {
  const first = mergeInstallSource(null, {
    utm_source: 'newsletter',
    utm_campaign: 'spring',
    referrer: 'https://www.google.com/search?q=secret',
  })
  assert.equal(first.changed, true)
  assert.equal(first.record.utm_source, 'newsletter')
  assert.equal(first.record.referrer, 'https://www.google.com')
  assert.equal(typeof first.record.captured_at, 'string')

  const second = mergeInstallSource(first.record, {
    utm_source: 'other',
    utm_medium: 'email',
    install_source: 'unpacked',
  })
  assert.equal(second.record.utm_source, 'newsletter')
  assert.equal(second.record.utm_medium, 'email')
  assert.equal(second.record.install_source, undefined)

  const withChannel = mergeInstallSource(
    second.record,
    { install_source: 'unpacked' },
    { allowChannel: true },
  )
  assert.equal(withChannel.record.install_source, 'unpacked')

  const props = installSourceProperties({
    ...withChannel.record,
    source_locked_at: '2020-01-01T00:00:00.000Z',
  })
  assert.deepEqual(props, {
    install_source: 'unpacked',
    utm_source: 'newsletter',
    utm_medium: 'email',
    utm_campaign: 'spring',
    referrer: 'https://www.google.com',
  })
})

test('first-run window is closed without a lock and after it expires', () => {
  const now = Date.parse('2026-09-22T00:00:00.000Z')
  assert.equal(isFirstRunWindowOpen(null, now), false)
  assert.equal(isFirstRunWindowOpen({ utm_source: 'x' }, now), false)
  assert.equal(isFirstRunWindowOpen({ source_locked_at: '2026-09-21T23:50:00.000Z' }, now), true)
  assert.equal(isFirstRunWindowOpen({ source_locked_at: '2026-09-21T00:00:00.000Z' }, now), false)
})

test('enrichment stays open until install locks an old record', () => {
  const now = Date.parse('2026-09-22T00:00:00.000Z')
  assert.equal(canEnrichInstallSource(null, now), true)
  assert.equal(canEnrichInstallSource({ captured_at: '2026-09-21T23:55:00.000Z' }, now), true)
  assert.equal(canEnrichInstallSource({ captured_at: '2026-09-21T00:00:00.000Z' }, now), false)
  assert.equal(
    canEnrichInstallSource({ source_locked_at: '2026-09-21T23:50:00.000Z' }, now),
    true,
  )
  assert.equal(
    canEnrichInstallSource({ source_locked_at: '2026-09-21T00:00:00.000Z' }, now),
    false,
  )
})

test('locked mixpanel event names stay on the contract', () => {
  const read = (path: string) => readFileSync(path, 'utf8')
  const pick = read('src/components/onboarding/PickPath.vue')
  const welcome = read('src/components/Welcome.vue')
  const autofill = read('src/content/autofill.ts')
  const index = read('src/content/index.js')
  const contract = read('src/utils/fillContract.ts')
  const greenhouse = read('src/utils/siteRules/greenhouse.ts')
  const mixpanelHttp = read('src/services/mixpanelHttp.ts')
  const background = read('background.js')

  assert.match(pick, /trackEvent\('onboarding_started'/)
  assert.match(welcome, /trackEvent\('profile_completed'/)
  assert.match(contract, /autofill_attempted/)
  assert.match(contract, /autofill_succeeded/)
  assert.match(contract, /autofill_failed/)
  assert.match(autofill, /trackFillContract\('autofill_attempted'/)
  assert.match(autofill, /autofill_succeeded/)
  assert.match(autofill, /autofill_failed/)
  assert.match(index, /trackEvent\('application_submitted'/)
  assert.doesNotMatch(autofill, /autofill_triggered/)
  assert.doesNotMatch(autofill, /autofill_completed/)
  assert.doesNotMatch(pick, /profile_setup_started/)
  assert.doesNotMatch(welcome, /profile_setup_completed/)
  assert.match(greenhouse, /function greenhouseConfig/)
  assert.match(greenhouse, /detectAts/)
  assert.match(mixpanelHttp, /action: 'trackMixpanel'/)
  assert.match(background, /request\.action === 'trackMixpanel'/)
})
