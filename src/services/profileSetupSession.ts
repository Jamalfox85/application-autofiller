// src/services/profileSetupSession.ts
//
// Bridges onboarding_started (fired from PickPath.vue, when the user picks a path) and
// profile_completed (fired later from Welcome.vue, once onboarding finishes) so the
// completed event can report how long setup took. Kept in chrome.storage.local rather than
// component state since the popup can close mid-onboarding and reopen later.
//
// profileSetupCompletedAt is also the Match Score gate. Every exit from Welcome — including
// "Skip for now", which never starts a session — must set it. A later call does not move
// the original timestamp.
import type { StorageAreaLike } from '../lib/sync/activeProfile.ts'

const SESSION_KEY = 'profileSetupSession'
const COMPLETED_AT_KEY = 'profileSetupCompletedAt'

interface ProfileSetupSession {
  id: string
  startedAt: number
}

function localStorage(): StorageAreaLike {
  return chrome.storage.local
}

export async function startProfileSetupSession(
  storage: StorageAreaLike = localStorage(),
): Promise<ProfileSetupSession> {
  const session: ProfileSetupSession = { id: crypto.randomUUID(), startedAt: Date.now() }
  await storage.set({ [SESSION_KEY]: session })
  return session
}

export async function getProfileSetupSession(
  storage: StorageAreaLike = localStorage(),
): Promise<ProfileSetupSession | null> {
  const data = await storage.get(SESSION_KEY)
  return (data[SESSION_KEY] as ProfileSetupSession | undefined) ?? null
}

export async function completeProfileSetupSession(
  storage: StorageAreaLike = localStorage(),
): Promise<void> {
  const existing = await getProfileSetupCompletedAt(storage)
  if (existing == null) {
    await storage.set({ [COMPLETED_AT_KEY]: Date.now() })
  }
  await storage.remove(SESSION_KEY)
}

// "Skip for now" does not pick a path, so no setup session exists. It is still a finish.
export function skipProfileSetup(storage?: StorageAreaLike): Promise<void> {
  return completeProfileSetupSession(storage)
}

// Read by the content script to gate/time job_site_visit_detected and Match Score.
export async function getProfileSetupCompletedAt(
  storage: StorageAreaLike = localStorage(),
): Promise<number | null> {
  const data = await storage.get(COMPLETED_AT_KEY)
  const value = data[COMPLETED_AT_KEY]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
