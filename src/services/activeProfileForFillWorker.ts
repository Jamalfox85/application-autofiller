// Runs in the service worker. The apply page's connect-src blocks a content
// script fetch to Supabase, which is the same reason resume bytes are loaded here.
import { fetchActiveProfileForFill, fetchedProfileStillActive } from '../lib/activeProfileForFill.ts'
import type { PersonalInfo } from '../types/index.ts'
import { readActiveProfileId, writeProfileMirrors, type StorageAreaLike } from '../lib/sync/activeProfile.ts'
import { authStorageKeyForUrl, parseStoredSession } from '../utils/savedResumeFile.ts'

export type ActiveProfileForFillResult =
  | { ok: true; personalInfo: PersonalInfo }
  | { ok: false }

function viteEnv(name: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY'): string {
  try {
    const value =
      name === 'VITE_SUPABASE_URL'
        ? import.meta.env.VITE_SUPABASE_URL
        : import.meta.env.VITE_SUPABASE_ANON_KEY
    return typeof value === 'string' ? value.trim() : ''
  } catch {
    return ''
  }
}

function workerStorage(): StorageAreaLike | null {
  const local = globalThis.chrome?.storage?.local
  if (!local?.get || !local?.set) return null
  return {
    get: (keys) => local.get(keys),
    set: (items) => local.set(items),
    remove: (keys) => local.remove(keys),
  }
}

export async function loadActiveProfileForFillWorker(): Promise<ActiveProfileForFillResult> {
  try {
    const supabaseUrl = viteEnv('VITE_SUPABASE_URL')
    const anonKey = viteEnv('VITE_SUPABASE_ANON_KEY')
    const storage = workerStorage()
    if (!supabaseUrl || !anonKey || !storage || typeof globalThis.fetch !== 'function') {
      return { ok: false }
    }
    const storageKey = authStorageKeyForUrl(supabaseUrl)
    if (!storageKey) return { ok: false }
    const stored = await storage.get(storageKey)
    const session = parseStoredSession(storageKey, stored[storageKey])
    if (!session?.accessToken) return { ok: false }
    if (session.expiresAt && session.expiresAt * 1000 <= Date.now()) return { ok: false }

    const beforeId = await readActiveProfileId(storage)
    const fetched = await fetchActiveProfileForFill({
      supabaseUrl,
      anonKey,
      accessToken: session.accessToken,
      profileId: beforeId,
      fetchImpl: (url, init) => globalThis.fetch(url, init),
    })
    if (!fetched) return { ok: false }
    const afterId = await readActiveProfileId(storage)
    if (!fetchedProfileStillActive(beforeId, afterId, fetched.id)) return { ok: false }
    try {
      await writeProfileMirrors(storage, { personalInfo: fetched.personalInfo })
    } catch {
      // This fill still uses the profile we just read. The mirror stays as it was.
    }
    return { ok: true, personalInfo: fetched.personalInfo }
  } catch {
    return { ok: false }
  }
}
