// The AES key is cached in chrome.storage.session, not chrome.storage.local.
// Session storage is cleared when the browser session ends and is not part of
// the personalInfo mirror, so a copy of the saved profile does not include the
// key. Each extension realm (popup, worker, content script) has its own memory
// cache; the session record is what they share.
//
// Session storage is trusted-contexts only until the service worker calls
// openAccountKeySession(). That lets the content-script isolated world read the
// key. Page JavaScript still has no chrome.storage. The raw key is not written
// to the DOM and is not logged.
import { importAccountKeyFromBase64 } from './accountSecrets.ts'

export const ACCOUNT_KEY_SESSION_STORAGE_KEY = 'accountCryptoKey'

// Content scripts are the "untrusted" contexts in this API. The page's main
// world is not one of them and cannot call chrome.storage.
export const ACCOUNT_KEY_SESSION_ACCESS_LEVEL = 'TRUSTED_AND_UNTRUSTED_CONTEXTS' as const

let sessionAccess: Promise<void> | null = null

// Called on every service-worker start, before the key is written. A restart
// re-evaluates the worker, so this runs again. Safe to call more than once.
export function openAccountKeySession(): Promise<void> {
  if (!sessionAccess) {
    sessionAccess = grantContentScriptSessionAccess().then(
      () => undefined,
      () => {
        sessionAccess = null
      },
    )
  }
  return sessionAccess
}

export function resetAccountKeySessionAccessForTests(): void {
  sessionAccess = null
}

async function grantContentScriptSessionAccess(): Promise<void> {
  const session = chrome.storage?.session as
    | {
        setAccessLevel?: (options: {
          accessLevel: typeof ACCOUNT_KEY_SESSION_ACCESS_LEVEL
        }) => Promise<void> | void
      }
    | undefined
  if (typeof session?.setAccessLevel !== 'function') return
  try {
    await session.setAccessLevel({ accessLevel: ACCOUNT_KEY_SESSION_ACCESS_LEVEL })
  } catch {
    // Older Chrome keeps session storage limited to the popup and the worker.
    // Fills then keep legacy plaintext, or skip a sealed password. The next
    // worker start tries again.
    throw new Error('session access level unavailable')
  }
}

interface StoredAccountKey {
  userId: string
  b64: string
}

let memory: CryptoKey | null = null
let memoryUserId: string | null = null

function sessionArea():
  | {
      get(keys: string | string[]): Promise<Record<string, unknown>>
      set(items: Record<string, unknown>): Promise<void>
      remove(keys: string | string[]): Promise<void>
    }
  | null {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.session) return null
    return chrome.storage.session
  } catch {
    return null
  }
}

function parseStored(value: unknown): StoredAccountKey | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const userId = typeof record.userId === 'string' ? record.userId : ''
  const b64 = typeof record.b64 === 'string' ? record.b64.trim() : ''
  if (!userId || !b64) return null
  return { userId, b64 }
}

// `expectedUserId` rejects a session key that belongs to someone else. Fill
// code omits it and uses whatever key the signed-in session last cached.
export async function readCachedAccountKey(expectedUserId?: string | null): Promise<CryptoKey | null> {
  const area = sessionArea()
  if (!area) {
    memory = null
    memoryUserId = null
    return null
  }
  try {
    const data = await area.get(ACCOUNT_KEY_SESSION_STORAGE_KEY)
    const stored = parseStored(data[ACCOUNT_KEY_SESSION_STORAGE_KEY])
    if (!stored || (expectedUserId && stored.userId !== expectedUserId)) {
      memory = null
      memoryUserId = null
      return null
    }
    if (memory && memoryUserId === stored.userId) return memory
    memory = await importAccountKeyFromBase64(stored.b64)
    memoryUserId = stored.userId
    return memory
  } catch {
    memory = null
    memoryUserId = null
    return null
  }
}

export async function cacheAccountKey(userId: string, b64: string): Promise<CryptoKey | null> {
  const clean = b64.trim()
  if (!userId || !clean) return null
  let key: CryptoKey
  try {
    key = await importAccountKeyFromBase64(clean)
  } catch {
    return null
  }
  memory = key
  memoryUserId = userId
  const area = sessionArea()
  if (!area) return key
  try {
    await area.set({
      [ACCOUNT_KEY_SESSION_STORAGE_KEY]: { userId, b64: clean } satisfies StoredAccountKey,
    })
  } catch {
    // The in-memory key still decrypts this realm. The next realm refetches.
  }
  return key
}

export async function clearCachedAccountKey(): Promise<void> {
  memory = null
  memoryUserId = null
  const area = sessionArea()
  if (!area) return
  try {
    await area.remove(ACCOUNT_KEY_SESSION_STORAGE_KEY)
  } catch {
    // Sign-out still dropped the profile mirror. The key dies with the session.
  }
}
