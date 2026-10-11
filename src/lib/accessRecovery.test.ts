import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  ACCESS_TOKEN_REFRESH_MARGIN_MS,
  accessTokenNeedsRefresh,
  classifyRefreshFailure,
  isInvalidOrExpiredAccessTokenError,
  isRevokedRefreshTokenError,
  recoverHttp401,
} from './accessRecovery.ts'
import { storedSessionAction } from './sessionStorageChange.ts'

const tokenError = { message: 'invalid or expired access token', status: 401 }

test('billing and sync 401s are the expired access token, not a 5xx or a network error', () => {
  assert.equal(isInvalidOrExpiredAccessTokenError(tokenError), true)
  assert.equal(
    isInvalidOrExpiredAccessTokenError({ message: 'Something went wrong', original: tokenError }),
    true,
  )
  assert.equal(isInvalidOrExpiredAccessTokenError({ message: 'JWT expired', status: 401 }), false)
  assert.equal(isInvalidOrExpiredAccessTokenError({ status: 500, message: 'unavailable' }), false)
  assert.equal(isInvalidOrExpiredAccessTokenError(new TypeError('Failed to fetch')), false)
})

test('a rejected refresh signs out; a 5xx or network failure does not', async () => {
  const profile = { phone: '(215) 555-0100', address: '1 Analytical Engine', zip: '19104' }
  let signedOut = 0
  const signOut = async () => {
    signedOut += 1
  }

  const rejected = await recoverHttp401(
    { ok: false as const, reason: 'http_401' },
    {
      refresh: async () => ({ ok: false as const, transient: false }),
      signOut,
      retry: async () => {
        throw new Error('refresh failed')
      },
    },
  )
  assert.equal(rejected.reason, 'http_401')
  assert.equal(signedOut, 1)
  assert.equal(profile.phone, '(215) 555-0100')

  const offline = await recoverHttp401(
    { ok: false as const, reason: 'http_401' },
    {
      refresh: async () => ({ ok: false as const, transient: true }),
      signOut,
      retry: async () => {
        throw new Error('offline')
      },
    },
  )
  assert.equal(offline.reason, 'http_401')
  assert.equal(signedOut, 1)

  const server = await recoverHttp401(
    { ok: false as const, reason: 'http_503' },
    {
      refresh: async () => {
        throw new Error('should not refresh')
      },
      signOut,
      retry: async () => {
        throw new Error('should not retry')
      },
    },
  )
  assert.equal(server.reason, 'http_503')
  assert.equal(signedOut, 1)

  let retried = 0
  const recovered = await recoverHttp401(
    { ok: false as const, reason: 'http_401' },
    {
      refresh: async () => ({ ok: true as const, token: 'new-jwt' }),
      signOut,
      retry: async () => {
        retried += 1
        return { ok: true as const, reason: undefined }
      },
    },
  )
  assert.equal(recovered.ok, true)
  assert.equal(retried, 1)
  assert.equal(signedOut, 1)

  const stillRejected = await recoverHttp401(
    { ok: false as const, reason: 'http_401' },
    {
      refresh: async () => ({ ok: true as const, token: 'new-jwt' }),
      signOut,
      retry: async () => ({ ok: false as const, reason: 'http_401' }),
    },
  )
  assert.equal(stillRejected.reason, 'http_401')
  assert.equal(signedOut, 1)
  assert.deepEqual(profile, { phone: '(215) 555-0100', address: '1 Analytical Engine', zip: '19104' })
})

test('an expired access token and a refresh rotation race do not sign out', () => {
  const expiredAccess = { status: 401, message: 'invalid or expired access token' }
  assert.equal(isRevokedRefreshTokenError(expiredAccess), false)
  assert.deepEqual(classifyRefreshFailure(expiredAccess, null), { ok: false, transient: true })

  const alreadyUsed = { status: 400, message: 'Invalid Refresh Token: Already Used' }
  assert.equal(isRevokedRefreshTokenError(alreadyUsed), false)
  assert.deepEqual(classifyRefreshFailure(alreadyUsed, null), { ok: false, transient: true })

  const discarded = {
    status: 409,
    message: 'Refresh result discarded: session state changed mid-flight (e.g., concurrent signOut)',
  }
  assert.equal(isRevokedRefreshTokenError(discarded), false)
  assert.deepEqual(classifyRefreshFailure(discarded, null), { ok: false, transient: true })

  const revoked = { status: 400, message: 'Invalid Refresh Token: Refresh Token Not Found' }
  assert.equal(isRevokedRefreshTokenError(revoked), true)
  assert.deepEqual(classifyRefreshFailure(revoked, null), { ok: false, transient: false })

  assert.deepEqual(classifyRefreshFailure({ status: 500, message: 'upstream' }, null), {
    ok: false,
    transient: true,
  })
  assert.deepEqual(classifyRefreshFailure({ status: 0, message: 'Failed to fetch' }, null), {
    ok: false,
    transient: true,
  })
  assert.deepEqual(classifyRefreshFailure(null, 'jwt'), { ok: true, token: 'jwt' })
  assert.deepEqual(classifyRefreshFailure(null, null), { ok: false, transient: true })
})

test('the access token is refreshed inside five minutes, including after it has expired', () => {
  const now = Date.parse('2026-10-11T18:00:00Z')
  assert.equal(ACCESS_TOKEN_REFRESH_MARGIN_MS, 5 * 60 * 1000)
  assert.equal(accessTokenNeedsRefresh(Math.floor(now / 1000) + 4 * 60, now), true)
  assert.equal(accessTokenNeedsRefresh(Math.floor(now / 1000) + 6 * 60, now), false)
  assert.equal(accessTokenNeedsRefresh(Math.floor(now / 1000) - 30, now), true)
  assert.equal(accessTokenNeedsRefresh(null, now), false)
})

test('a storage clear re-reads the session instead of signing the popup out', () => {
  assert.equal(storedSessionAction('signed-in', { 'sb-abc-auth-token': { newValue: undefined } }), 'reread')
  assert.equal(storedSessionAction('loading', { 'sb-abc-auth-token': { newValue: undefined } }), 'reread')
  assert.equal(storedSessionAction('signed-out', { 'sb-abc-auth-token': { newValue: undefined } }), 'ignore')
  assert.equal(storedSessionAction('signed-out', { 'sb-abc-auth-token': { newValue: { access_token: 'x' } } }), 'reread')
  assert.equal(storedSessionAction('signed-in', { personalInfo: { newValue: { phone: '1' } } }), 'ignore')
  assert.equal(storedSessionAction('signed-in', { 'sb-abc-auth-token': { newValue: { access_token: 'fresh' } } }), 'ignore')
})

test('expired-session cleanup does not wipe the local profile, and the popup drops Pro and Synced', () => {
  const recovery = readFileSync(new URL('./accessRecovery.ts', import.meta.url), 'utf8')
  const expire = recovery.slice(recovery.indexOf('async function expireSessionOnce'), recovery.indexOf('export async function billingCallRecoveringSession'))
  assert.match(expire, /scope: 'local'/)
  assert.doesNotMatch(expire, /personalInfo/)
  assert.doesNotMatch(expire, /SIGN_OUT_LOCAL_KEYS/)

  const app = readFileSync(new URL('../App.vue', import.meta.url), 'utf8')
  assert.match(app, /if \(next === 'signed-out'\)/)
  assert.match(app, /billing\.value = null/)
  assert.match(app, /planIsPro\.value = null/)
  assert.match(app, /authStatus === 'signed-in' && billing\?\.isPro/)
  assert.match(app, /authStatus === 'signed-in' && activeView === 'main'/)

  const profiles = readFileSync(new URL('../composables/useProfiles.ts', import.meta.url), 'utf8')
  assert.match(profiles, /billingCallRecoveringSession/)
  const plan = readFileSync(new URL('../services/billing/profilePlan.ts', import.meta.url), 'utf8')
  assert.match(plan, /billingCallRecoveringSession\(token, \(next\) =>/)
  const rpc = readFileSync(new URL('./sync/profiles.ts', import.meta.url), 'utf8')
  assert.match(rpc, /withSupabaseRecovery/)
  const history = readFileSync(new URL('./sync/fillHistory.ts', import.meta.url), 'utf8')
  assert.match(history, /withSupabaseRecovery\(\(\) => queryFillHistory/)
  assert.match(history, /withSupabaseRecovery\(\(\) => insertFillHistoryOnce/)
  assert.match(history, /withSupabaseRecovery\(\(\) => clearFillHistoryOnce/)

  const client = readFileSync(new URL('./supabase.ts', import.meta.url), 'utf8')
  assert.match(client, /lock: navigatorLock/)
  const token = readFileSync(new URL('./api.ts', import.meta.url), 'utf8')
  assert.match(token, /refreshSessionIfExpiring/)
  assert.doesNotMatch(token, /60_000/)
  const worker = readFileSync(new URL('../services/extensionPayWorker.ts', import.meta.url), 'utf8')
  assert.match(worker, /refreshSessionIfExpiring/)
  assert.match(worker, /handleAuthRefreshMessage/)
  const background = readFileSync(new URL('../../background.js', import.meta.url), 'utf8')
  assert.match(background, /refreshSupabaseSession/)
  const resume = readFileSync(new URL('../utils/savedResumeFile.ts', import.meta.url), 'utf8')
  assert.match(resume, /requestRefresh/)
  const auth = readFileSync(new URL('./auth.ts', import.meta.url), 'utf8')
  assert.match(auth, /readPersistedSession/)
})
