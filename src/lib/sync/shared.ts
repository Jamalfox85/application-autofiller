// Shared helpers for the Supabase <-> chrome.storage.local sync layer.
//
// Model: Supabase is the source of truth for profile data, custom responses, and fill
// history. chrome.storage.local keeps a *mirror* of each so the content script (and the
// popup, when offline) can keep reading synchronously without a Supabase round-trip. The
// popup refreshes the mirror on load and rewrites it on every save.
import { supabase } from '../supabase'

// Reads the signed-in user's id from the locally-cached session (no network call). Returns
// null when there's no session — callers then fall back to the local mirror only.
export async function getUserIdOrNull(): Promise<string | null> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    return session?.user?.id ?? null
  } catch {
    return null
  }
}

export async function writeMirror(key: string, value: unknown): Promise<void> {
  await chrome.storage.local.set({ [key]: JSON.parse(JSON.stringify(value)) })
}

export async function readMirror<T>(key: string): Promise<T | undefined> {
  const data = await chrome.storage.local.get(key)
  return data[key] as T | undefined
}

// Re-exported for existing import sites. Profile tables are written only through the
// save_profile RPC (see ./profile.ts); there is no delete-by-user_id helper any more.
export { makeClientIds } from './profileRows'
