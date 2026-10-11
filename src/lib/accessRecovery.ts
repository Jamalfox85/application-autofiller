// An expired Supabase access token still looks signed-in: getSession() returns the
// cached session, and billing/plan, billing/plan/refresh, and profile sync then 401
// with "invalid or expired access token". Refresh once with the refresh token and
// retry the call. Sign out only when that refresh is rejected because the refresh
// token itself is invalid or revoked. An expired access JWT, a refresh-token
// rotation race ("already used"), a network error, or a 5xx keeps the session.

import { isSupabaseAuthStorageKey } from './googleAuth.ts'

export type RefreshResult = { ok: true; token: string } | { ok: false; transient: boolean }

// Refresh before calls once the access token is this close to expires_at.
// The service worker's autoRefresh timer does not survive MV3 sleep, and
// supabase-js only refreshes inside a 90s margin, so a wake an hour later
// would otherwise send the expired JWT.
export const ACCESS_TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000

const TOKEN_RE = /invalid or expired access token/i
const ALREADY_USED_RE = /already used|refresh result discarded|session state changed mid-flight/i
const REVOKED_REFRESH_RE = /invalid refresh token|refresh token not found|refresh_token_not_found/i

function errorText(error: unknown): string {
  const chunks: string[] = []
  const seen = new Set<unknown>()
  const walk = (value: unknown, depth: number) => {
    if (value == null || depth > 4 || (typeof value === 'object' && seen.has(value))) return
    if (typeof value === 'string') {
      chunks.push(value)
      return
    }
    if (typeof value !== 'object') return
    seen.add(value)
    const record = value as Record<string, unknown>
    for (const key of ['message', 'msg', 'error_description', 'details', 'hint', 'code']) {
      if (typeof record[key] === 'string') chunks.push(record[key])
    }
    for (const key of ['original', 'error', 'cause']) {
      if (record[key] != null && record[key] !== value) walk(record[key], depth + 1)
    }
  }
  walk(error, 0)
  return chunks.join('\n')
}

export function isInvalidOrExpiredAccessTokenError(error: unknown): boolean {
  return TOKEN_RE.test(errorText(error))
}

// True only for a dead refresh token. "Invalid Refresh Token: Already Used" is a
// rotation race with another extension context, not a revoked login.
export function isRevokedRefreshTokenError(error: unknown): boolean {
  const text = errorText(error)
  if (!text || ALREADY_USED_RE.test(text)) return false
  return REVOKED_REFRESH_RE.test(text)
}

export function accessTokenNeedsRefresh(
  expiresAtSec: number | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!expiresAtSec) return false
  return expiresAtSec * 1000 - nowMs <= ACCESS_TOKEN_REFRESH_MARGIN_MS
}

function statusOf(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null
  const status = (error as { status?: unknown }).status
  return typeof status === 'number' ? status : null
}

function messageOf(error: unknown): string {
  if (!error || typeof error !== 'object') return ''
  const message = (error as { message?: unknown }).message
  return typeof message === 'string' ? message : ''
}

// `accessToken` set means the refresh worked. Anything short of a revoked refresh
// token is transient: the expired access JWT, a 401 from billing, "already used"
// after another context rotated the refresh token, network errors, and 5xx.
export function classifyRefreshFailure(
  error: unknown,
  accessToken: string | null | undefined,
): RefreshResult {
  if (accessToken) return { ok: true, token: accessToken }
  if (isRevokedRefreshTokenError(error)) return { ok: false, transient: false }
  const status = statusOf(error)
  const message = messageOf(error) || errorText(error)
  if (status != null && status >= 500) return { ok: false, transient: true }
  if (status === 0 || /failed to fetch|networkerror|network error|timeout|load failed/i.test(message)) {
    return { ok: false, transient: true }
  }
  return { ok: false, transient: true }
}

export async function recoverHttp401<T extends { ok: boolean; reason?: string }>(
  first: T,
  deps: {
    refresh: () => Promise<RefreshResult>
    signOut: () => Promise<void>
    retry: () => Promise<T>
  },
): Promise<T> {
  if (first.ok || first.reason !== 'http_401') return first
  let refreshed: RefreshResult
  try {
    refreshed = await deps.refresh()
  } catch {
    return first
  }
  if (!refreshed.ok) {
    if (!refreshed.transient) await deps.signOut()
    return first
  }
  let second: T
  try {
    second = await deps.retry()
  } catch {
    return first
  }
  // The refresh token worked. A second 401 is not a revoked refresh token.
  return second
}

let refreshInflight: Promise<RefreshResult> | null = null

export function refreshAccessToken(): Promise<RefreshResult> {
  if (!refreshInflight) {
    refreshInflight = refreshAccessTokenOnce().finally(() => {
      refreshInflight = null
    })
  }
  return refreshInflight
}

function parseStoredRecord(value: unknown): Record<string, unknown> | null {
  let raw: unknown = value
  if (typeof value === 'string') {
    try {
      raw = JSON.parse(value)
    } catch {
      return null
    }
  }
  if (!raw || typeof raw !== 'object') return null
  return raw as Record<string, unknown>
}

// The session another context already wrote, without calling refreshSession.
// getSession() refreshes inside a 90s margin and can report an error while this
// record is still valid.
export async function readPersistedSession(): Promise<Record<string, unknown> | null> {
  const get = globalThis.chrome?.storage?.local?.get
  if (typeof get !== 'function') return null
  const bag = await new Promise<Record<string, unknown>>((resolve) => {
    try {
      get.call(chrome.storage.local, null, (value: Record<string, unknown>) => {
        resolve(value && typeof value === 'object' ? value : {})
      })
    } catch {
      resolve({})
    }
  })
  for (const [key, value] of Object.entries(bag)) {
    if (!isSupabaseAuthStorageKey(key)) continue
    const record = parseStoredRecord(value)
    if (record && typeof record.access_token === 'string' && record.access_token) return record
  }
  return null
}

function usableAccessToken(session: Record<string, unknown> | null, nowMs = Date.now()): string | null {
  if (!session || typeof session.access_token !== 'string' || !session.access_token) return null
  const expiresAt = session.expires_at
  if (typeof expiresAt === 'number' && expiresAt * 1000 <= nowMs + 5_000) return null
  return session.access_token
}

async function refreshAccessTokenOnce(): Promise<RefreshResult> {
  try {
    const { supabase } = await import('./supabase.ts')
    const { data, error } = await supabase.auth.refreshSession()
    if (data.session?.access_token) return { ok: true, token: data.session.access_token }
    if (!isRevokedRefreshTokenError(error)) {
      const adopted = usableAccessToken(await readPersistedSession())
      if (adopted) return { ok: true, token: adopted }
    }
    return classifyRefreshFailure(error, null)
  } catch (error) {
    if (!isRevokedRefreshTokenError(error)) {
      const adopted = usableAccessToken(await readPersistedSession())
      if (adopted) return { ok: true, token: adopted }
    }
    return classifyRefreshFailure(error, null)
  }
}

// Service-worker wake and any call that is about to use the access token.
// Null when the stored token is still outside the margin (no network).
export async function refreshSessionIfExpiring(nowMs = Date.now()): Promise<RefreshResult | null> {
  const persisted = await readPersistedSession()
  const expiresAt = persisted && typeof persisted.expires_at === 'number' ? persisted.expires_at : null
  if (!persisted?.access_token || !accessTokenNeedsRefresh(expiresAt, nowMs)) return null
  const result = await refreshAccessToken()
  if (!result.ok && !result.transient) await expireSessionKeepingLocalProfile()
  return result
}

let expiring: Promise<void> | null = null

// Clears the cached Supabase session only. Profile mirrors (personalInfo and the
// rest of the local vault) stay on disk so the next sign-in still has them.
export function expireSessionKeepingLocalProfile(): Promise<void> {
  if (!expiring) {
    expiring = expireSessionOnce().finally(() => {
      expiring = null
    })
  }
  return expiring
}

async function expireSessionOnce(): Promise<void> {
  const { supabase } = await import('./supabase.ts')
  const { error } = await supabase.auth.signOut({ scope: 'local' })
  if (error) console.warn('[auth] could not clear the expired session', error)
}

export async function billingCallRecoveringSession<T extends { ok: boolean; reason?: string }>(
  token: string,
  call: (token: string) => Promise<T>,
): Promise<T> {
  const first = await call(token)
  let nextToken = ''
  return recoverHttp401(first, {
    refresh: async () => {
      const refreshed = await refreshAccessToken()
      if (refreshed.ok) nextToken = refreshed.token
      return refreshed
    },
    signOut: expireSessionKeepingLocalProfile,
    retry: () => call(nextToken),
  })
}

export async function withSupabaseRecovery<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (!isInvalidOrExpiredAccessTokenError(error)) throw error
    const refreshed = await refreshAccessToken()
    if (!refreshed.ok) {
      if (!refreshed.transient) await expireSessionKeepingLocalProfile()
      throw error
    }
    return await run()
  }
}
