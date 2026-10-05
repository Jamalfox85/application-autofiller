// The `activeProfile` mirror in chrome.storage.local, plus the small pure helpers the popup,
// content script and service worker share. Supabase (`profiles.active_profile_id`) is the
// source of truth; the popup rewrites this mirror on open and on every swap. The content
// script keeps reading `personalInfo` / `customResponses` exactly as before, so fill code
// doesn't change.
//
// Pure: no supabase-js, no chrome globals at import time (callers pass the storage area).

export const ACTIVE_PROFILE_KEY = 'activeProfile'
export const PERSONAL_INFO_KEY = 'personalInfo'
export const CUSTOM_RESPONSES_KEY = 'customResponses'
// Prototype local roster (pre multi-profile). It held portal passwords; cleared on startup.
export const LEGACY_PROFILE_ROSTER_KEY = 'profileRoster'

export interface ActiveProfileMirror {
  id: string
  name: string
  profileCount: number
}

export interface StorageAreaLike {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
  remove(keys: string | string[]): Promise<void>
}

export function parseActiveProfile(value: unknown): ActiveProfileMirror | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const id = typeof record.id === 'string' ? record.id.trim() : ''
  if (!id) return null
  const name = typeof record.name === 'string' ? record.name : ''
  const count =
    typeof record.profileCount === 'number' && Number.isFinite(record.profileCount)
      ? Math.max(1, Math.floor(record.profileCount))
      : 1
  return { id, name, profileCount: count }
}

export function activeMirrorFromList(
  list: { id: string; name: string; is_active: boolean }[],
): ActiveProfileMirror | null {
  const active = list.find((p) => p.is_active) ?? null
  if (!active) return null
  return { id: active.id, name: active.name, profileCount: list.length }
}

export async function readActiveProfile(storage: StorageAreaLike): Promise<ActiveProfileMirror | null> {
  try {
    const data = await storage.get(ACTIVE_PROFILE_KEY)
    return parseActiveProfile(data[ACTIVE_PROFILE_KEY])
  } catch {
    return null
  }
}

export async function readActiveProfileId(storage: StorageAreaLike): Promise<string | null> {
  return (await readActiveProfile(storage))?.id ?? null
}

// Writes every mirror the fill path reads in ONE storage.set, so a fill that runs mid-swap
// sees either the old profile or the new one, never a mix. Keys left undefined are untouched.
export async function writeProfileMirrors(
  storage: StorageAreaLike,
  mirrors: {
    personalInfo?: unknown
    customResponses?: unknown
    activeProfile?: ActiveProfileMirror | null
  },
): Promise<void> {
  const items: Record<string, unknown> = {}
  if (mirrors.personalInfo !== undefined) {
    items[PERSONAL_INFO_KEY] = JSON.parse(JSON.stringify(mirrors.personalInfo))
  }
  if (mirrors.customResponses !== undefined) {
    items[CUSTOM_RESPONSES_KEY] = JSON.parse(JSON.stringify(mirrors.customResponses))
  }
  if (mirrors.activeProfile) items[ACTIVE_PROFILE_KEY] = { ...mirrors.activeProfile }
  if (Object.keys(items).length) await storage.set(items)
}

export async function clearLegacyProfileRoster(storage: StorageAreaLike): Promise<void> {
  try {
    await storage.remove(LEGACY_PROFILE_ROSTER_KEY)
  } catch {
    // Best effort. Retried on the next startup.
  }
}

// Only users with 2+ profiles see which one is in use; everyone else keeps today's copy.
export function showsProfileName(active: ActiveProfileMirror | null | undefined): boolean {
  return !!active && active.profileCount >= 2 && !!active.name.trim()
}

export function truncateProfileName(name: string, max = 18): string {
  const clean = name.trim()
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean
}

export function autofillButtonLabel(active: ActiveProfileMirror | null | undefined): string {
  return showsProfileName(active) ? `Autofill as ${truncateProfileName(active!.name, 22)}` : 'Auto-fill application'
}

export function fillToastSubtitle(active: ActiveProfileMirror | null | undefined): string {
  return showsProfileName(active) ? `Filled with ${truncateProfileName(active!.name, 28)}` : 'Autofill completed'
}

// "edited 3d ago" for the Profiles list.
export function editedAgo(updatedAt: string, now = Date.now()): string {
  const at = Date.parse(updatedAt)
  if (Number.isNaN(at)) return ''
  const minutes = Math.max(0, Math.round((now - at) / 60000))
  if (minutes < 1) return 'edited just now'
  if (minutes < 60) return `edited ${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `edited ${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `edited ${days}d ago`
  const months = Math.round(days / 30)
  if (months < 12) return `edited ${months}mo ago`
  return `edited ${Math.round(months / 12)}y ago`
}
