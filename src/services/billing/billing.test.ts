import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PAYWALL_COPY } from './copy.ts'
import {
  applySuccessfulFill,
  calendarWeekKey,
  decideFill,
  decideFillWithRefresh,
  emptyQuota,
  mergeQuotaRecords,
  type FillQuotaRecord,
} from './quota.ts'
import { isPlanRequiredResponse } from './planRequired.ts'
import {
  PAID_EVENT,
  buildChannelFromInstallSource,
  hardPaywallShownProps,
  proPurchasedProps,
  softPaywallShownProps,
} from './paidEvents.ts'
import { postBillingPlan } from './billingPlan.ts'
import {
  clearPendingProfilePlan,
  flushPendingProfilePlan,
  syncProPlanAfterPurchase,
  type PendingPlanStore,
} from './profilePlan.ts'
import { PRO_RESUME_PATHS, postProResume, proResumeHeaders } from './proApiContract.ts'
import {
  EXTENSION_PAY_EXTENSION_ID,
  EXTENSION_PAY_PLAN_SKUS,
  FREE_FILL_LIMIT,
  SOFT_GATE_AT,
  isExtPayUserPaid,
  isExtensionPayConfigured,
  priceForPlan,
} from './plans.ts'
import {
  PAID_SYNC_GRACE_MS,
  applyEntitlementToBilling,
  fillQuotaNote,
  proUnlockAction,
  resolveIsPro,
} from './proUnlock.ts'

const duringWeek = new Date('2026-09-15T12:00:00')
const sameWeek = new Date('2026-09-20T12:00:00')
const nextWeek = new Date('2026-09-21T12:00:00')

function quota(overrides: Partial<FillQuotaRecord> = {}): FillQuotaRecord {
  return {
    ...emptyQuota(calendarWeekKey(duringWeek), { firstFillEver: true, greenhouseFillEver: true }),
    ...overrides,
  }
}

test('free quota allows 25, nudges once at 10, and never on the first fill', () => {
  assert.equal(decideFill({ quota: quota({ successfulFills: 24, firstFillEver: false }), isPro: false, ats: 'greenhouse' }), 'allow')
  const first = applySuccessfulFill(quota({ successfulFills: 0, firstFillEver: false, greenhouseFillEver: false }), 'greenhouse', false)
  assert.equal(first.nudge, null)
  assert.equal(first.quota.successfulFills, 1)
  assert.equal(first.quota.firstFillEver, true)

  const ninth = applySuccessfulFill(quota({ successfulFills: 9 }), 'greenhouse', false)
  assert.equal(ninth.nudge, 'soft')
  assert.equal(ninth.quota.softPaywallShownForWeek, true)
  // The nudge is after the fill. Declining it does not turn this quota into a block.
  assert.equal(decideFill({ quota: ninth.quota, isPro: false, ats: 'greenhouse' }), 'allow')

  const tenth = applySuccessfulFill(ninth.quota, 'lever', false)
  assert.equal(tenth.nudge, null)
  assert.equal(tenth.quota.successfulFills, 11)

  assert.equal(decideFill({ quota: quota({ successfulFills: 24 }), isPro: false, ats: 'greenhouse' }), 'allow')
  assert.equal(decideFill({ quota: quota({ successfulFills: 25 }), isPro: false, ats: 'greenhouse' }), 'block')
  assert.equal(decideFill({ quota: quota({ successfulFills: 25 }), isPro: true, ats: 'greenhouse' }), 'allow')
})

test('workday stays free and the first greenhouse success stays ungated at the cap', () => {
  const atCap = quota({ successfulFills: 25 })
  assert.equal(decideFill({ quota: atCap, isPro: false, ats: 'workday' }), 'allow')
  const workday = applySuccessfulFill(quota({ successfulFills: 9, softPaywallShownForWeek: false }), 'workday', false)
  assert.equal(workday.nudge, null)
  assert.equal(workday.quota.softPaywallShownForWeek, false)

  assert.equal(
    decideFill({
      quota: quota({ successfulFills: 25, greenhouseFillEver: false }),
      isPro: false,
      ats: 'greenhouse',
    }),
    'allow',
  )
  assert.equal(
    decideFill({
      quota: quota({ successfulFills: 25, greenhouseFillEver: true }),
      isPro: false,
      ats: 'greenhouse',
    }),
    'block',
  )
})

test('a new calendar week resets the counter and keeps lifetime flags', () => {
  const stored = quota({ successfulFills: 25, softPaywallShownForWeek: true, greenhouseFillEver: true })
  assert.equal(calendarWeekKey(duringWeek), calendarWeekKey(sameWeek))
  const held = mergeQuotaRecords(stored, null, sameWeek)
  assert.equal(held.week, calendarWeekKey(duringWeek))
  assert.equal(held.successfulFills, 25)

  const rolled = mergeQuotaRecords(stored, null, nextWeek)
  assert.equal(rolled.week, calendarWeekKey(nextWeek))
  assert.notEqual(rolled.week, stored.week)
  assert.equal(rolled.successfulFills, 0)
  assert.equal(rolled.softPaywallShownForWeek, false)
  assert.equal(rolled.firstFillEver, true)
  assert.equal(rolled.greenhouseFillEver, true)

  const legacyMonth = {
    month: '2026-09',
    successfulFills: 25,
    firstFillEver: true,
    greenhouseFillEver: true,
    softPaywallShownForMonth: true,
  }
  const migrated = mergeQuotaRecords(legacyMonth, null, duringWeek)
  assert.equal(migrated.week, calendarWeekKey(duringWeek))
  assert.equal(migrated.successfulFills, 0)
  assert.equal(migrated.softPaywallShownForWeek, false)
  assert.equal(migrated.firstFillEver, true)
  assert.equal(migrated.greenhouseFillEver, true)
})

test('pro fills do not consume the free counter', () => {
  const start = quota({ successfulFills: 10 })
  const next = applySuccessfulFill(start, 'greenhouse', true)
  assert.equal(next.quota.successfulFills, 10)
  assert.equal(next.nudge, null)
})

test('locked paywall copy and mixpanel names', () => {
  assert.equal(PAYWALL_COPY.soft.title, 'You\u2019ve used 10 of 25 free fills this week')
  assert.equal(
    PAYWALL_COPY.soft.body,
    'Go Pro for unlimited autofills, plus Application Match Score and up to 5 profiles.',
  )
  assert.equal(PAYWALL_COPY.soft.primary, 'Upgrade to Pro \u2014 $5.99/mo')
  assert.equal(PAYWALL_COPY.soft.secondary, 'Continue free (15 fills left)')
  assert.equal(PAYWALL_COPY.soft.tertiary, 'See annual \u2014 $49/yr')
  assert.equal(PAYWALL_COPY.hard.title, 'You\u2019ve hit your free fill limit')
  assert.equal(
    PAYWALL_COPY.hard.body,
    'Unlock unlimited fills, Application Match Score, and up to 5 profiles with Pro.',
  )
  assert.equal(PAYWALL_COPY.hard.primary, 'Get Pro \u2014 $5.99/mo or $49/yr')
  assert.equal(PAYWALL_COPY.resumeAi.title, 'Application Match Score is a Pro feature.')
  assert.equal(PAYWALL_COPY.resumeAi.cta, 'Upgrade to Pro')
  assert.equal(PAYWALL_COPY.multiProfile.title, 'Up to 5 profiles, each with its own resume, are a Pro feature.')
  assert.equal(PAYWALL_COPY.lockedProfile.title, 'Resubscribe to use this profile again.')
  assert.equal(JSON.stringify(PAYWALL_COPY).toLowerCase().includes('workday'), false)

  assert.equal(PAID_EVENT.softShown, 'soft_paywall_shown')
  assert.equal(PAID_EVENT.softCta, 'soft_paywall_cta_clicked')
  assert.equal(PAID_EVENT.softDismissed, 'soft_paywall_dismissed')
  assert.equal(PAID_EVENT.hardShown, 'hard_paywall_shown')
  assert.equal(PAID_EVENT.hardCta, 'hard_paywall_cta_clicked')
  assert.equal(PAID_EVENT.hardDismissed, 'hard_paywall_dismissed')
  assert.equal(PAID_EVENT.surfaceShown, 'pro_surface_gate_shown')
  assert.equal(PAID_EVENT.surfaceCta, 'pro_surface_gate_cta_clicked')
  assert.equal(PAID_EVENT.checkoutOpened, 'checkout_opened')
  assert.equal(PAID_EVENT.checkoutAbandoned, 'checkout_abandoned')
  assert.equal(PAID_EVENT.purchased, 'pro_purchased')

  const soft = softPaywallShownProps({
    fillCount: 10,
    fillsRemaining: 15,
    atsSite: 'greenhouse',
    distinctId: 'install-1',
    userId: 'user-1',
    extensionVersion: '1.0.5',
    buildChannel: 'draft',
  })
  assert.equal(soft.is_first_fill, false)
  assert.equal(soft.trigger, 'fill_threshold')
  assert.equal(soft.plan_shown_default, 'monthly')
  assert.equal(soft.build_channel, 'draft')

  const hard = hardPaywallShownProps({ fillCount: 25, atsSite: 'greenhouse', buildChannel: buildChannelFromInstallSource('chrome_web_store') })
  assert.equal(hard.is_first_fill, false)
  assert.equal(hard.build_channel, 'cws')

  const purchased = proPurchasedProps({
    ctx: { atsSite: 'greenhouse', fillCount: 10 },
    plan: 'annual',
    price: priceForPlan('annual'),
    source: 'hard_cap',
    fillCountAtPurchase: 10,
  })
  assert.equal(purchased.plan, 'annual')
  assert.equal(purchased.price, 49)
  assert.equal(priceForPlan('monthly'), 5.99)
})

test('plan_required 403 opens the resume gate, including a nested error code', () => {
  const enveloped = { success: false, error: { code: 'plan_required', message: 'Pro plan required' } }
  const codeOnly = { error: { code: 'plan_required', message: 'Pro plan required' } }
  const nested = { success: false, error: { error: { code: 'plan_required', message: 'Pro plan required' } } }
  assert.equal(isPlanRequiredResponse(403, enveloped), true)
  assert.equal(isPlanRequiredResponse(403, codeOnly), true)
  assert.equal(isPlanRequiredResponse(403, nested), true)
  assert.equal(isPlanRequiredResponse(401, enveloped), false)
  assert.equal(isPlanRequiredResponse(403, { success: false, error: { code: 'other', message: 'no' } }), false)
  assert.equal(isPlanRequiredResponse(403, { success: false, error: 'Pro plan required' }), false)
  assert.equal(isPlanRequiredResponse(403, { success: true, error: { code: 'plan_required' } }), false)
})

test('generate and ats analyze send the supabase bearer token', async () => {
  assert.deepEqual(PRO_RESUME_PATHS, {
    generate: '/resumes/generate',
    analyze: '/ats/analyze',
  })
  assert.equal('tailor' in PRO_RESUME_PATHS, false)

  const headers = proResumeHeaders('access-token', '')
  assert.equal(headers.Authorization, 'Bearer access-token')
  assert.equal(headers['X-API-Key'], undefined)
  assert.equal(proResumeHeaders('access-token', 'live-key')['X-API-Key'], 'live-key')
  assert.equal(proResumeHeaders('access-token', 'your-resume-api-key')['X-API-Key'], undefined)

  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetchImpl: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(
      JSON.stringify({ success: false, error: { code: 'plan_required', message: 'Pro plan required' } }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const blocked = await postProResume({
    action: 'generate',
    body: { job_description: 'Role' },
    fetchImpl,
    token: 'jwt-1',
    baseUrl: 'http://localhost:8080/api/v1',
    apiKey: '',
  })
  assert.deepEqual(blocked, { ok: false, gate: 'resume_ai' })
  assert.equal(calls[0].url, 'http://localhost:8080/api/v1/resumes/generate')
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, 'Bearer jwt-1')
  assert.equal(calls[0].init.method, 'POST')

  const fetchNested: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(
      JSON.stringify({ error: { error: { code: 'plan_required', message: 'Pro plan required' } } }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    )
  }
  const blockedNested = await postProResume({
    action: 'analyze',
    body: { job_description: 'Role' },
    fetchImpl: fetchNested,
    token: 'jwt-1b',
    baseUrl: 'https://api.example.com/api/v1',
    apiKey: '',
  })
  assert.deepEqual(blockedNested, { ok: false, gate: 'resume_ai' })
  assert.equal(calls[1].url, 'https://api.example.com/api/v1/ats/analyze')
  assert.equal((calls[1].init.headers as Record<string, string>).Authorization, 'Bearer jwt-1b')

  const fetchOk: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(JSON.stringify({ success: true, data: { score: 81 } }), { status: 200 })
  }
  const scored = await postProResume({
    action: 'analyze',
    body: { job_description: 'Role' },
    fetchImpl: fetchOk,
    token: 'jwt-2',
    baseUrl: 'https://api.example.com/api/v1/',
    apiKey: '',
  })
  assert.deepEqual(scored, { ok: true, data: { score: 81 } })
  assert.equal(calls[2].url, 'https://api.example.com/api/v1/ats/analyze')
  assert.equal((calls[2].init.headers as Record<string, string>).Authorization, 'Bearer jwt-2')

  const app = readFileSync('src/App.vue', 'utf8')
  // The Pro row emits its own source (resume_ai or multi_profile) instead of App.vue
  // hardwiring resume_ai.
  assert.match(app, /<ProFeatures\s[^>]*@upgrade="onProUpgrade"/)
  const proFeatures = readFileSync('src/components/ProFeatures.vue', 'utf8')
  assert.match(proFeatures, /emit\('upgrade', 'resume_ai'\)/)
  assert.match(proFeatures, /emit\('upgrade', 'multi_profile'\)/)
  const proApi = readFileSync('src/services/billing/proApi.ts', 'utf8')
  assert.match(proApi, /getValidAccessToken/)
})

function memoryPlanStore(initial?: unknown): { store: PendingPlanStore; read: () => unknown } {
  let value = initial
  return {
    store: {
      async get() {
        return value
      },
      async setPro() {
        value = 'pro'
      },
      async clear() {
        value = undefined
      },
    },
    read: () => value,
  }
}

test('purchase posts billing/plan and does not update profiles.plan', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const pending = memoryPlanStore()
  const synced = await syncProPlanAfterPurchase({
    store: pending.store,
    token: 'user-jwt',
    apiKey: 'live-key',
    baseUrl: 'https://api.example.com/api/v1/',
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} })
      return new Response(JSON.stringify({ success: true, data: { plan: 'pro' } }), { status: 200 })
    },
  })
  assert.deepEqual(synced, { ok: true })
  assert.equal(pending.read(), undefined)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://api.example.com/api/v1/billing/plan')
  assert.equal(calls[0].init.method, 'POST')
  const headers = calls[0].init.headers as Record<string, string>
  assert.equal(headers.Authorization, 'Bearer user-jwt')
  assert.equal(headers['X-API-Key'], 'live-key')
  assert.equal(calls[0].init.body, JSON.stringify({ plan: 'pro' }))

  const kept = memoryPlanStore()
  const failed = await syncProPlanAfterPurchase({
    store: kept.store,
    token: 'user-jwt',
    apiKey: 'live-key',
    baseUrl: 'https://api.example.com/api/v1',
    fetchImpl: async () => new Response(JSON.stringify({ success: false }), { status: 503 }),
  })
  assert.equal(failed.ok, false)
  assert.equal(kept.read(), 'pro')

  let fetched = false
  const offline = memoryPlanStore()
  const missingKey = await syncProPlanAfterPurchase({
    store: offline.store,
    token: 'user-jwt',
    apiKey: '',
    baseUrl: 'https://api.example.com/api/v1',
    fetchImpl: async () => {
      fetched = true
      return new Response('no')
    },
  })
  assert.deepEqual(missingKey, { ok: false, reason: 'missing_api_key' })
  assert.equal(fetched, false)
  assert.equal(offline.read(), 'pro')

  const direct = await postBillingPlan({
    token: 'user-jwt',
    apiKey: 'your-resume-api-key',
    baseUrl: 'https://api.example.com/api/v1',
    fetchImpl: async () => {
      throw new Error('placeholder key must not be sent')
    },
  })
  assert.deepEqual(direct, { ok: false, reason: 'missing_api_key' })

  const legacyFree = memoryPlanStore('free')
  let flushed = false
  await flushPendingProfilePlan({
    store: legacyFree.store,
    token: 'user-jwt',
    apiKey: 'live-key',
    fetchImpl: async () => {
      flushed = true
      return new Response('no')
    },
  })
  assert.equal(flushed, false)
  assert.equal(legacyFree.read(), undefined)

  const queued = memoryPlanStore('pro')
  await clearPendingProfilePlan(queued.store)
  assert.equal(queued.read(), undefined)

  const planWrite = readFileSync('src/services/billing/profilePlan.ts', 'utf8')
  assert.match(planWrite, /getValidAccessToken/)
  assert.doesNotMatch(planWrite, /supabase/)
  assert.doesNotMatch(planWrite, /\.update\(/)
  assert.doesNotMatch(planWrite, /from\('profiles'\)/)
  const worker = readFileSync('src/services/extensionPayWorker.ts', 'utf8')
  assert.match(worker, /syncProPlanAfterPurchase/)
  assert.match(worker, /writeEntitlement/)
  assert.doesNotMatch(worker, /writeProfilePlan/)
  assert.doesNotMatch(worker, /from\('profiles'\)/)
})

test('home screen upgrade sits beside autofill and uses paywall checkout', () => {
  const app = readFileSync('src/App.vue', 'utf8')
  assert.match(app, /class="fill-actions-row"/)
  assert.match(app, /class="autofill-btn"[\s\S]*?class="upgrade-btn"/)
  assert.match(app, /v-if="showUpgrade"/)
  assert.match(app, /billing\.value != null && !billing\.value\.isPro/)
  assert.match(app, /openProCheckout\(\{/)
  assert.match(app, /plan: 'monthly'/)
  assert.match(app, /source: 'popup'/)
  assert.match(app, /\.upgrade-btn\s*\{[^}]*background:\s*#7c3aed/)
  assert.match(app, /\.container\s*\{[^}]*width:\s*400px;/)
  assert.match(app, /\.container\s*\{[^}]*height:\s*600px;/)
  assert.equal(FREE_FILL_LIMIT, 25)
  assert.equal(SOFT_GATE_AT, 10)

  const paywall = readFileSync('src/content/fillPaywall.ts', 'utf8')
  const toastStack = readFileSync('src/content/toastStack.ts', 'utf8')
  assert.match(paywall, /mountInToastStack\(card\)/)
  assert.match(toastStack, /right:\s*20px/)
  assert.match(toastStack, /bottom:\s*20px/)
  assert.match(paywall, /openProCheckout\(\{/)
})

test('extension pay skus and profile plan stay out of ordinary profile saves', () => {
  assert.equal(EXTENSION_PAY_EXTENSION_ID, 'gofillr')
  assert.equal(isExtensionPayConfigured(''), false)
  assert.equal(isExtensionPayConfigured('gofillr'), true)
  assert.deepEqual(EXTENSION_PAY_PLAN_SKUS, { monthly: 'pro_monthly', annual: 'pro_annual' })

  const profileSync = readFileSync('src/lib/sync/profile.ts', 'utf8')
  const fn = profileSync.slice(profileSync.indexOf('export function profileToDbRows'), profileSync.indexOf('export function dbRowsToProfile'))
  assert.doesNotMatch(fn, /\bplan:/)
  assert.doesNotMatch(fn, /writeProfilePlan/)

  const planWrite = readFileSync('src/services/billing/profilePlan.ts', 'utf8')
  assert.match(planWrite, /PENDING_PLAN_KEY/)
  assert.match(planWrite, /postBillingPlan/)
  assert.doesNotMatch(planWrite, /from\('profiles'\)/)
  assert.doesNotMatch(planWrite, /\.update\(/)

  const upload = readFileSync('background.js', 'utf8')
  const uploadFn = upload.slice(upload.indexOf('async function handleResumeUpload'), upload.indexOf('chrome.runtime.onMessage.addListener'))
  assert.match(uploadFn, /Authorization: `Bearer \$\{token\}`/)
  assert.doesNotMatch(uploadFn, /plan_required/)
  assert.doesNotMatch(uploadFn, /\/resumes\/generate/)
  assert.doesNotMatch(uploadFn, /\/ats\/analyze/)

  const autofill = readFileSync('src/content/autofill.ts', 'utf8')
  assert.match(autofill, /evaluateFillAccess/)
  assert.match(autofill, /commitSuccessfulFill/)
  assert.doesNotMatch(autofill, /resumes\/generate/)
})

test('ExtPay paidAt grants Pro unless the subscription has lapsed', () => {
  const paidAt = new Date('2026-10-04T12:00:00Z')
  assert.equal(isExtPayUserPaid(null), false)
  assert.equal(isExtPayUserPaid({ paid: false, paidAt: null }), false)
  assert.equal(isExtPayUserPaid({ paid: true, paidAt: null }), true)
  // onPaid fires on paidAt. A refresh must not demote that purchase because paid is false.
  assert.equal(isExtPayUserPaid({ paid: false, paidAt }), true)
  assert.equal(isExtPayUserPaid({ paid: false, paidAt: '2026-10-04T12:00:00Z', subscriptionStatus: 'active' }), true)
  assert.equal(isExtPayUserPaid({ paid: false, paidAt, subscriptionStatus: 'past_due' }), false)
  assert.equal(isExtPayUserPaid({ paid: false, paidAt, subscriptionStatus: 'canceled' }), false)
  // user.paid lags behind an active subscription, and paidAt can still be empty.
  assert.equal(isExtPayUserPaid({ paid: false, paidAt: null, subscriptionStatus: 'active' }), true)
  assert.equal(isExtPayUserPaid({ paid: false, paidAt: null, subscriptionStatus: 'Active' }), true)
  assert.equal(isExtPayUserPaid({ paid: 'true' as unknown as boolean, paidAt: null }), true)
  assert.equal(isExtPayUserPaid({ paid: false, paidAt, subscriptionStatus: 'cancelled' }), false)
  assert.equal(isExtPayUserPaid({ paid: false, paidAt: '  ', subscriptionStatus: null }), false)
})

test('a paid ExtPay user is Pro at the 25-fill cap and the popup says so', () => {
  const atCap = quota({ successfulFills: 25 })
  assert.equal(decideFill({ quota: atCap, isPro: true, ats: 'greenhouse' }), 'allow')
  assert.equal(decideFill({ quota: atCap, isPro: false, ats: 'greenhouse' }), 'block')
  assert.equal(fillQuotaNote(true, 25), 'Pro · unlimited fills')
  assert.equal(fillQuotaNote(false, 25), '25 of 25 free fills this week')

  const free = { isPro: false, plan: null as 'monthly' | 'annual' | null, fillCount: 25 }
  const upgraded = applyEntitlementToBilling(free, { isPro: true, plan: 'monthly', updatedAt: 1 })
  assert.equal(upgraded.isPro, true)
  assert.equal(upgraded.plan, 'monthly')
  assert.equal(fillQuotaNote(upgraded.isPro, upgraded.fillCount), 'Pro · unlimited fills')
  assert.equal(applyEntitlementToBilling(upgraded, { isPro: true, plan: 'monthly' }), upgraded)
})

test('a just-confirmed Pro user is not demoted by a lagging unpaid ExtPay read', () => {
  const now = Date.parse('2026-10-06T15:00:00Z')
  const previous = { isPro: true, updatedAt: now - 30_000 }
  assert.equal(resolveIsPro(previous, { paid: false, paidAt: null }, now), true)
  assert.equal(
    resolveIsPro(previous, { paid: false, paidAt: null, subscriptionStatus: 'canceled' }, now),
    false,
  )
  assert.equal(
    resolveIsPro({ isPro: true, updatedAt: now - PAID_SYNC_GRACE_MS }, { paid: false, paidAt: null }, now),
    false,
  )
  assert.equal(resolveIsPro({ isPro: false, updatedAt: 0 }, { paid: false, paidAt: null }, now), false)
  assert.equal(resolveIsPro({ isPro: false, updatedAt: 0 }, { paid: false, paidAt: null }, now, true), true)
})

test('paying removes the in-page cap gate without refilling an ungated page', () => {
  const blocked = {
    previousIsPro: false,
    nextIsPro: true,
    hardPaywallOpen: true,
    paywallOpen: true,
    blockedByCap: true,
  }
  assert.equal(proUnlockAction(blocked), 'resume')
  assert.equal(proUnlockAction({ ...blocked, hardPaywallOpen: false, paywallOpen: false }), 'resume')
  assert.equal(
    proUnlockAction({ ...blocked, hardPaywallOpen: false, blockedByCap: false }),
    'dismiss',
  )
  assert.equal(
    proUnlockAction({
      previousIsPro: false,
      nextIsPro: true,
      hardPaywallOpen: false,
      paywallOpen: false,
      blockedByCap: false,
    }),
    'none',
  )
  assert.equal(proUnlockAction({ ...blocked, previousIsPro: true }), 'none')
  assert.equal(proUnlockAction({ ...blocked, nextIsPro: false }), 'none')
})

test('upgrade and already-paid sign-in refresh Pro without a Chrome reload', () => {
  const worker = readFileSync('src/services/extensionPayWorker.ts', 'utf8')
  const openCheckout = worker.slice(worker.indexOf("billingAction === 'openCheckout'"))
  const openLogin = openCheckout.slice(openCheckout.indexOf("billingAction === 'openLogin'"))
  assert.match(openCheckout.slice(0, openCheckout.indexOf("billingAction === 'openLogin'")), /watchUntilPaid\(\)/)
  assert.match(openLogin, /watchUntilPaid\(\)/)
  assert.match(worker, /EXTPAY_USER_KEY/)
  assert.match(worker, /onExtPayUserStored/)
  assert.match(worker, /onPaid\.addListener/)
  assert.match(worker, /resolveIsPro/)
  assert.match(worker, /reopenPopupAfterPro/)

  const app = readFileSync('src/App.vue', 'utf8')
  assert.match(app, /onEntitlementStored/)
  assert.match(app, /ENTITLEMENT_KEY/)
  assert.match(app, /fillQuotaNote\(billing\.isPro, billing\.fillCount\)/)
  assert.match(app, /class="plan-badge">Pro</)
  assert.match(app, /window\.addEventListener\('focus', onPopupFocus\)/)

  const page = readFileSync('src/content/index.js', 'utf8')
  assert.match(page, /installProUnlock\(resumeAutofillAfterPro\)/)
  assert.match(page, /resumeAutofillAfterPro/)

  const autofill = readFileSync('src/content/autofill.ts', 'utf8')
  assert.match(autofill, /rememberFillBlock\(\{ code: 'hard_cap', paywall: 'hard' \}\)/)
  assert.doesNotMatch(autofill, /skipFreeFillCapForDryRun/)
  const block = autofill.slice(autofill.indexOf('rememberFillBlock'), autofill.indexOf('const activeSiteRule'))
  assert.match(block, /code: 'hard_cap'/)

  const paywall = readFileSync('src/content/fillPaywall.ts', 'utf8')
  assert.match(paywall, /dataset\.paywall = mode/)

  const unlock = readFileSync('src/services/billing/proUnlock.ts', 'utf8')
  assert.match(unlock, /extensionpay_user/)
  assert.match(unlock, /installProUnlock/)

  const background = readFileSync('background.js', 'utf8')
  assert.match(background, /typeof request !== 'object'/)
  assert.match(background, /extpay-fetch-user/)
})

test('a stale free entitlement re-checks ExtPay before the hard cap blocks', async () => {
  const atCap = quota({ successfulFills: 25 })
  let refreshes = 0
  const refresh = (isPro: boolean) => async () => {
    refreshes += 1
    return isPro
  }

  assert.equal(await decideFillWithRefresh({ quota: atCap, isPro: false, ats: 'greenhouse' }, refresh(true)), 'allow')
  assert.equal(await decideFillWithRefresh({ quota: atCap, isPro: false, ats: 'greenhouse' }, refresh(false)), 'block')
  assert.equal(refreshes, 2)

  // Under the cap, or already Pro, skips the worker round trip.
  assert.equal(
    await decideFillWithRefresh({ quota: quota({ successfulFills: 3 }), isPro: false, ats: 'lever' }, refresh(false)),
    'allow',
  )
  assert.equal(await decideFillWithRefresh({ quota: atCap, isPro: true, ats: 'lever' }, refresh(false)), 'allow')
  assert.equal(refreshes, 2)

  const failing = async (): Promise<boolean> => {
    throw new Error('worker unavailable')
  }
  assert.equal(await decideFillWithRefresh({ quota: atCap, isPro: false, ats: 'lever' }, failing), 'block')
})
