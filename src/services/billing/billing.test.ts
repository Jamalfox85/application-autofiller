import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PAYWALL_COPY } from './copy.ts'
import {
  applySuccessfulFill,
  calendarMonthKey,
  decideFill,
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
  isExtensionPayConfigured,
  priceForPlan,
} from './plans.ts'
import { addRosterProfile, initialRoster } from './profileRoster.ts'
import { cloneDefaultPersonalInfo } from '../../lib/personalInfoDefaults.ts'

const month = new Date('2026-09-15T12:00:00')

function quota(overrides: Partial<FillQuotaRecord> = {}): FillQuotaRecord {
  return {
    ...emptyQuota('2026-09', { firstFillEver: true, greenhouseFillEver: true }),
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
  assert.equal(ninth.quota.softPaywallShownForMonth, true)

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
  const workday = applySuccessfulFill(quota({ successfulFills: 9, softPaywallShownForMonth: false }), 'workday', false)
  assert.equal(workday.nudge, null)
  assert.equal(workday.quota.softPaywallShownForMonth, false)

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

test('a new calendar month resets the counter and keeps lifetime flags', () => {
  const stored = quota({ successfulFills: 25, softPaywallShownForMonth: true, greenhouseFillEver: true })
  const rolled = mergeQuotaRecords(stored, null, new Date('2026-10-01T00:00:00'))
  assert.equal(rolled.month, '2026-10')
  assert.equal(rolled.successfulFills, 0)
  assert.equal(rolled.softPaywallShownForMonth, false)
  assert.equal(rolled.firstFillEver, true)
  assert.equal(rolled.greenhouseFillEver, true)
  assert.equal(calendarMonthKey(month), '2026-09')
})

test('pro fills do not consume the free counter', () => {
  const start = quota({ successfulFills: 10 })
  const next = applySuccessfulFill(start, 'greenhouse', true)
  assert.equal(next.quota.successfulFills, 10)
  assert.equal(next.nudge, null)
})

test('locked paywall copy and mixpanel names', () => {
  assert.equal(PAYWALL_COPY.soft.title, 'You\u2019ve used 10 of 25 free fills this month')
  assert.equal(
    PAYWALL_COPY.soft.body,
    'Go Pro for unlimited autofills \u2014 plus resume AI tailor, ATS score, and multi-profile.',
  )
  assert.equal(PAYWALL_COPY.soft.primary, 'Upgrade to Pro \u2014 $5.99/mo')
  assert.equal(PAYWALL_COPY.soft.secondary, 'Continue free (15 fills left)')
  assert.equal(PAYWALL_COPY.soft.tertiary, 'See annual \u2014 $49/yr')
  assert.equal(PAYWALL_COPY.hard.title, 'You\u2019ve hit your free fill limit')
  assert.equal(
    PAYWALL_COPY.hard.body,
    'Unlock unlimited fills, resume AI tailor + ATS score, and multi-profile with Pro.',
  )
  assert.equal(PAYWALL_COPY.hard.primary, 'Get Pro \u2014 $5.99/mo or $49/yr')
  assert.equal(PAYWALL_COPY.resumeAi.title, 'Resume tailor + ATS score is a Pro feature.')
  assert.equal(PAYWALL_COPY.resumeAi.cta, 'Upgrade to Pro')
  assert.equal(PAYWALL_COPY.multiProfile.title, 'Multiple profiles are a Pro feature.')
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
  assert.match(app, /@plan-required="resumeOpen = false; openPaywall\('resume_ai'\)"/)
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

test('a second profile is a roster addition and does not drop the primary', () => {
  const info = cloneDefaultPersonalInfo()
  info.firstName = 'Ada'
  const roster = addRosterProfile(initialRoster(info), 'Contract', info)
  assert.equal(roster.profiles.length, 2)
  assert.equal(roster.profiles[0].name, 'Primary')
  assert.equal(roster.profiles[1].name, 'Contract')
  assert.equal(roster.activeId, roster.profiles[1].id)
})
