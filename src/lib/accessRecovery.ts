// A revoked Supabase access token still looks signed-in: getSession() returns the
// cached session, and billing/plan, billing/plan/refresh, and profile sync then 401
// with "invalid or expired access token". Try one refresh. If that refresh is rejected,
// drop the local session so the popup shows sign-in. Network errors and 5xx do not.

export type RefreshResult = { ok: true; token: string } | { ok: false; transient: boolean }

const TOKEN_RE = /invalid or expired access token/i

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

// `accessToken` set means the refresh worked. A 5xx or a failed fetch keeps the user
// signed in. 400/401/403, or a missing session with no network error, is a dead login.
export function classifyRefreshFailure(
  error: unknown,
  accessToken: string | null | undefined,
): RefreshResult {
  if (accessToken) return { ok: true, token: accessToken }
  const status = statusOf(error)
  const message = messageOf(error)
  if (status != null && status >= 500) return { ok: false, transient: true }
  if (status === 0 || /failed to fetch|networkerror|network error|timeout|load failed/i.test(message)) {
    return { ok: false, transient: true }
  }
  if (status === 400 || status === 401 || status === 403) return { ok: false, transient: false }
  if (/invalid refresh token|refresh token not found|already used/i.test(message)) {
    return { ok: false, transient: false }
  }
  if (!error) return { ok: false, transient: false }
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
  if (!second.ok && second.reason === 'http_401') await deps.signOut()
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

async function refreshAccessTokenOnce(): Promise<RefreshResult> {
  try {
    const { supabase } = await import('./supabase.ts')
    const { data, error } = await supabase.auth.refreshSession()
    return classifyRefreshFailure(error, data.session?.access_token)
  } catch (error) {
    return classifyRefreshFailure(error, null)
  }
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
    try {
      return await run()
    } catch (second) {
      if (isInvalidOrExpiredAccessTokenError(second)) await expireSessionKeepingLocalProfile()
      throw second
    }
  }
}
