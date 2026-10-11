import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { readFileSync } from 'node:fs'
import { sealPassword, importAccountKey, openPassword } from './accountSecrets.ts'
import {
  ACCOUNT_KEY_SESSION_ACCESS_LEVEL,
  cacheAccountKey,
  clearCachedAccountKey,
  openAccountKeySession,
  readCachedAccountKey,
  resetAccountKeySessionAccessForTests,
} from './accountKeyCache.ts'
import { openStoredPersonalInfo } from './openStoredPersonalInfo.ts'
import {
  SAVED_ACCOUNT_PASSWORD_SKIPPED,
  isGenericAccountPasswordField,
  legacyAccountPasswordLocked,
  noteSkippedAccountPassword,
  resetSkippedAccountPasswordNote,
} from './accountPasswordFill.ts'
import { icimsSavedPasswordLocked } from '../utils/siteRules/icimsAccount.ts'
import { workdaySavedPasswordLocked } from '../utils/siteRules/workdayAccount.ts'
import type { PersonalInfo } from '../types/index.ts'

const PLAINTEXT = 'workday-sign-in-secret'
const USER_ID = 'user-admin'

type Realm = 'trusted' | 'content-script'

function installSessionChrome() {
  const store: Record<string, unknown> = {}
  let access: 'TRUSTED_CONTEXTS' | 'TRUSTED_AND_UNTRUSTED_CONTEXTS' = 'TRUSTED_CONTEXTS'
  let realm: Realm = 'trusted'
  const calls: { accessLevel: string }[] = []

  const session = {
    async setAccessLevel(options: { accessLevel: 'TRUSTED_CONTEXTS' | 'TRUSTED_AND_UNTRUSTED_CONTEXTS' }) {
      calls.push({ accessLevel: options.accessLevel })
      access = options.accessLevel
    },
    async get(keys: string | string[]) {
      if (realm === 'content-script' && access !== 'TRUSTED_AND_UNTRUSTED_CONTEXTS') {
        throw new Error('Access to storage is not allowed from this context.')
      }
      const names = typeof keys === 'string' ? [keys] : keys
      const out: Record<string, unknown> = {}
      for (const name of names) out[name] = store[name]
      return out
    },
    async set(items: Record<string, unknown>) {
      if (realm === 'content-script' && access !== 'TRUSTED_AND_UNTRUSTED_CONTEXTS') {
        throw new Error('Access to storage is not allowed from this context.')
      }
      Object.assign(store, items)
    },
    async remove(keys: string | string[]) {
      const names = typeof keys === 'string' ? [keys] : keys
      for (const name of names) delete store[name]
    },
  }

  const chromeApi = { storage: { session } }
  ;(globalThis as { chrome?: unknown }).chrome = chromeApi

  return {
    calls,
    setRealm(next: Realm) {
      realm = next
    },
    dropAccess() {
      access = 'TRUSTED_CONTEXTS'
    },
    // Page JavaScript has no chrome.storage. The cached record stays in the
    // extension, but this realm cannot see the session area.
    asPage() {
      ;(globalThis as { chrome?: unknown }).chrome = {}
    },
    restoreExtension() {
      ;(globalThis as { chrome?: unknown }).chrome = chromeApi
    },
  }
}

async function freshKey(): Promise<{ b64: string; key: CryptoKey }> {
  const raw = crypto.getRandomValues(new Uint8Array(32))
  return { b64: Buffer.from(raw).toString('base64'), key: await importAccountKey(raw) }
}

function profile(passwords: { legacy: string; workday: string; icims: string }): PersonalInfo {
  return {
    accountPassword: passwords.legacy,
    applicationAccounts: [
      { id: 7, portal: 'Workday', email: 'ada@workday.example', password: passwords.workday, requireConfirmation: false },
      { id: 8, portal: 'iCIMS', email: 'ada@icims.example', password: passwords.icims, requireConfirmation: false },
    ],
  } as PersonalInfo
}

describe('account key session', { concurrency: 1 }, () => {
test('content script reads the cached account key only after the worker opens session storage', async () => {
  const chromeMock = installSessionChrome()
  resetAccountKeySessionAccessForTests()
  await clearCachedAccountKey()

  const { b64, key } = await freshKey()
  const sealed = await sealPassword(PLAINTEXT, key)
  assert.ok(await cacheAccountKey(USER_ID, b64))

  chromeMock.setRealm('content-script')
  assert.equal(await readCachedAccountKey(), null)

  const blocked = await openStoredPersonalInfo(profile({ legacy: sealed, workday: sealed, icims: sealed }))
  assert.equal(blocked.accountPassword, '')
  assert.equal(blocked.applicationAccounts?.[0].password, '')
  assert.equal(blocked.applicationAccounts?.[1].password, '')
  assert.equal(JSON.stringify(blocked).includes(sealed), false)
  assert.equal(JSON.stringify(blocked).includes(PLAINTEXT), false)
  assert.equal(workdaySavedPasswordLocked(blocked), true)
  assert.equal(icimsSavedPasswordLocked(blocked), true)
  assert.equal(legacyAccountPasswordLocked(blocked), true)

  await openAccountKeySession()
  assert.deepEqual(chromeMock.calls, [{ accessLevel: ACCOUNT_KEY_SESSION_ACCESS_LEVEL }])
  assert.equal(ACCOUNT_KEY_SESSION_ACCESS_LEVEL, 'TRUSTED_AND_UNTRUSTED_CONTEXTS')

  const read = await readCachedAccountKey()
  assert.ok(read)
  assert.equal(await openPassword(sealed, read), PLAINTEXT)

  const opened = await openStoredPersonalInfo(profile({ legacy: sealed, workday: sealed, icims: sealed }))
  assert.equal(opened.accountPassword, PLAINTEXT)
  assert.equal(opened.applicationAccounts?.[0].password, PLAINTEXT)
  assert.equal(workdaySavedPasswordLocked(opened), false)
  assert.equal(icimsSavedPasswordLocked(opened), false)
  assert.equal(legacyAccountPasswordLocked(opened), false)

  chromeMock.asPage()
  assert.equal(await readCachedAccountKey(), null)
  chromeMock.restoreExtension()
  chromeMock.setRealm('content-script')
  assert.equal(await openPassword(sealed, (await readCachedAccountKey()) as CryptoKey), PLAINTEXT)
})

test('a service-worker restart opens session storage again before a content script can read', async () => {
  const chromeMock = installSessionChrome()
  resetAccountKeySessionAccessForTests()
  await clearCachedAccountKey()

  const { b64, key } = await freshKey()
  const sealed = await sealPassword(PLAINTEXT, key)
  await cacheAccountKey(USER_ID, b64)
  await openAccountKeySession()
  chromeMock.setRealm('content-script')
  assert.equal(await openPassword(sealed, (await readCachedAccountKey()) as CryptoKey), PLAINTEXT)

  // The browser kept the session record, but a new worker starts with the
  // default trusted-only access level until it calls setAccessLevel again.
  chromeMock.dropAccess()
  resetAccountKeySessionAccessForTests()
  assert.equal(await readCachedAccountKey(), null)

  await openAccountKeySession()
  assert.equal(chromeMock.calls.length, 2)
  assert.equal(chromeMock.calls[1].accessLevel, 'TRUSTED_AND_UNTRUSTED_CONTEXTS')
  assert.equal(await openPassword(sealed, (await readCachedAccountKey()) as CryptoKey), PLAINTEXT)
})

test('the service worker opens session access on startup before it caches the key', () => {
  const background = readFileSync(new URL('../../background.js', import.meta.url), 'utf8')
  const worker = readFileSync(new URL('../services/accountKeyWorker.ts', import.meta.url), 'utf8')
  const openAt = background.indexOf('void openAccountKeySession()')
  const cacheAt = background.indexOf('ensureAccountKeyInSession()')
  assert.ok(openAt > 0)
  assert.ok(cacheAt > openAt)
  const listenerAt = background.indexOf('chrome.runtime.onMessage.addListener')
  assert.ok(openAt < listenerAt)

  const awaitOpen = worker.indexOf('await openAccountKeySession()')
  const fetchKey = worker.indexOf('ensureAccountKey()')
  assert.ok(awaitOpen > 0)
  assert.ok(fetchKey > awaitOpen)

  const content = [
    readFileSync(new URL('../content/autofill.ts', import.meta.url), 'utf8'),
    readFileSync(new URL('./openStoredPersonalInfo.ts', import.meta.url), 'utf8'),
    readFileSync(new URL('./accountPasswordFill.ts', import.meta.url), 'utf8'),
  ].join('\n')
  assert.equal(content.includes('setAccessLevel'), false)
  assert.equal(background.includes('TRUSTED_AND_UNTRUSTED_CONTEXTS'), false)
  const cache = readFileSync(new URL('./accountKeyCache.ts', import.meta.url), 'utf8')
  assert.match(cache, /TRUSTED_AND_UNTRUSTED_CONTEXTS/)
  assert.equal(/console\.(log|info|debug|warn|error)\(/.test(cache), false)
})

test('an undecrypted saved password is skipped, logged once, and not counted as a fill', async () => {
  const chromeMock = installSessionChrome()
  resetAccountKeySessionAccessForTests()
  await clearCachedAccountKey()
  resetSkippedAccountPasswordNote()

  const { key } = await freshKey()
  const sealed = await sealPassword(PLAINTEXT, key)
  chromeMock.setRealm('content-script')
  const opened = await openStoredPersonalInfo(profile({ legacy: sealed, workday: sealed, icims: sealed }))

  const lines: unknown[][] = []
  const original = console.info
  console.info = (...args: unknown[]) => {
    lines.push(args)
  }
  try {
    const passwordResult = workdaySavedPasswordLocked(opened) ? 'skip' : true
    const icimsResult = icimsSavedPasswordLocked(opened) ? 'skip' : true
    let filled = 0
    if (passwordResult !== 'skip' && passwordResult) filled += 1
    if (icimsResult !== 'skip' && icimsResult) filled += 1
    if (legacyAccountPasswordLocked(opened) && isGenericAccountPasswordField({ type: 'password' })) {
      noteSkippedAccountPassword()
    } else {
      filled += 1
    }
    noteSkippedAccountPassword()
    assert.equal(filled, 0)
    assert.equal(passwordResult, 'skip')
    assert.equal(icimsResult, 'skip')
  } finally {
    console.info = original
  }

  assert.equal(lines.length, 1)
  assert.deepEqual(lines[0], [SAVED_ACCOUNT_PASSWORD_SKIPPED])
  assert.equal(JSON.stringify(lines).includes(PLAINTEXT), false)
  assert.equal(JSON.stringify(lines).includes(sealed), false)
  assert.equal(JSON.stringify(lines).includes('gfr1:'), false)

  const autofill = readFileSync(new URL('../content/autofill.ts', import.meta.url), 'utf8')
  const genericSkip = autofill.indexOf('legacyAccountPasswordLocked(personalInfo)')
  const genericMatch = autofill.indexOf('matchFieldToData(', genericSkip)
  assert.ok(genericSkip > 0)
  assert.ok(autofill.indexOf('continue', genericSkip) < genericMatch)
  const workday = readFileSync(new URL('../utils/siteRules/workday.ts', import.meta.url), 'utf8')
  assert.match(workday, /passwordLocked && \(kind === 'password' \|\| kind === 'verifyPassword'\)\)/)
  assert.match(workday, /noteSkippedAccountPassword\(\)\s*return 'skip'/)
  const icims = readFileSync(new URL('../utils/siteRules/icims.ts', import.meta.url), 'utf8')
  assert.match(icims, /icimsSavedPasswordLocked\(personalInfo\)/)
  assert.match(icims, /noteSkippedAccountPassword\(\)\s*return 'skip'/)
})
})
