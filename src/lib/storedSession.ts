// Whether chrome.storage.local holds a Supabase session, without starting the
// Supabase client. The content script and the onboarding gate both need this:
// sign-out removes the session key, and a different account must not inherit
// the previous one's local stamp.
import { isSupabaseAuthStorageKey } from './googleAuth.ts'

function userIdFromAccessToken(token: string): string {
  const part = token.split('.')[1]
  if (!part) return ''
  try {
    const padded = part.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (part.length % 4)) % 4)
    const json = JSON.parse(atob(padded)) as { sub?: unknown }
    return typeof json.sub === 'string' ? json.sub : ''
  } catch {
    return ''
  }
}

function sessionRecord(value: unknown): Record<string, unknown> | null {
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

export function userIdFromSessionValue(value: unknown): string | null {
  const record = sessionRecord(value)
  if (!record) return null
  const user = record.user
  if (user && typeof user === 'object' && typeof (user as { id?: unknown }).id === 'string') {
    const id = (user as { id: string }).id.trim()
    if (id) return id
  }
  const accessToken = typeof record.access_token === 'string' ? record.access_token : ''
  if (!accessToken) return null
  const sub = userIdFromAccessToken(accessToken).trim()
  return sub || null
}

export function userIdFromStorageBag(bag: Record<string, unknown> | null | undefined): string | null {
  if (!bag) return null
  for (const [key, value] of Object.entries(bag)) {
    if (!isSupabaseAuthStorageKey(key)) continue
    const userId = userIdFromSessionValue(value)
    if (userId) return userId
  }
  return null
}

export function hasStoredSession(bag: Record<string, unknown> | null | undefined): boolean {
  if (!bag) return false
  for (const [key, value] of Object.entries(bag)) {
    if (!isSupabaseAuthStorageKey(key)) continue
    const record = sessionRecord(value)
    const accessToken = record && typeof record.access_token === 'string' ? record.access_token : ''
    if (accessToken) return true
  }
  return false
}
