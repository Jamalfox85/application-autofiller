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
//
// The stamp follows the signed-in account. Sign-out removes it with the rest of the local
// mirror. A new account decides Welcome from its own profile data, so someone else's
// "Skip for now" cannot skip Welcome. The same account with a saved profile still opens
// the dashboard, because that decision reads the profile rather than this stamp.
import { PERSONAL_INFO_KEY, type StorageAreaLike } from '../lib/sync/activeProfile.ts'
import { userIdFromStorageBag } from '../lib/storedSession.ts'

const SESSION_KEY = 'profileSetupSession'
const COMPLETED_AT_KEY = 'profileSetupCompletedAt'

export const PROFILE_SETUP_STORAGE_KEYS = [SESSION_KEY, COMPLETED_AT_KEY] as const

export interface BoundSetupCompletion {
  at: number
  userId: string
}

export function isBoundSetupCompletion(value: unknown): value is BoundSetupCompletion {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    typeof record.at === 'number' &&
    Number.isFinite(record.at) &&
    typeof record.userId === 'string' &&
    record.userId.length > 0
  )
}

export type SetupCompletionDecision =
  | { action: 'use'; at: number }
  | { action: 'bind'; at: number }
  | { action: 'drop' }
  | { action: 'none' }

// Popup gate. A bound stamp counts only for that account. A legacy number (no
// account id) counts only while this browser still holds that account's profile
// mirror — sign-out removes the mirror, so the next account cannot inherit it.
export function decideSetupCompletion(input: {
  stored: unknown
  userId: string | null
  personalInfoPresent: boolean
}): SetupCompletionDecision {
  if (!input.userId) return { action: 'none' }
  if (isBoundSetupCompletion(input.stored)) {
    return input.stored.userId === input.userId
      ? { action: 'use', at: input.stored.at }
      : { action: 'drop' }
  }
  if (typeof input.stored === 'number' && Number.isFinite(input.stored)) {
    if (!input.personalInfoPresent) return { action: 'drop' }
    return { action: 'bind', at: input.stored }
  }
  return { action: 'none' }
}

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
    const bag = await storage.get(null)
    const userId = userIdFromStorageBag(bag)
    const at = Date.now()
    await storage.set({
      [COMPLETED_AT_KEY]: userId ? { at, userId } : at,
    })
  }
  await storage.remove(SESSION_KEY)
}

// "Skip for now" does not pick a path, so no setup session exists. It is still a finish.
export function skipProfileSetup(storage?: StorageAreaLike): Promise<void> {
  return completeProfileSetupSession(storage)
}

// Read by the content script to gate/time job_site_visit_detected and Match Score.
// A legacy number still counts (installs that finished setup before the stamp
// was tied to an account). A bound stamp counts only for the signed-in account.
export async function getProfileSetupCompletedAt(
  storage: StorageAreaLike = localStorage(),
): Promise<number | null> {
  const data = await storage.get(COMPLETED_AT_KEY)
  const value = data[COMPLETED_AT_KEY]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (!isBoundSetupCompletion(value)) return null
  const bag = await storage.get(null)
  return userIdFromStorageBag(bag) === value.userId ? value.at : null
}

// Popup load. Drops a stamp that belongs to someone else, and binds a legacy
// number to the account whose profile mirror is still on this browser.
export async function readSetupCompletedAtForAccount(
  storage: StorageAreaLike,
  userId: string | null,
): Promise<number | null> {
  const data = await storage.get([COMPLETED_AT_KEY, PERSONAL_INFO_KEY])
  const decision = decideSetupCompletion({
    stored: data[COMPLETED_AT_KEY],
    userId,
    personalInfoPresent: data[PERSONAL_INFO_KEY] != null,
  })
  if (decision.action === 'drop') {
    await storage.remove([...PROFILE_SETUP_STORAGE_KEYS])
    return null
  }
  if (decision.action === 'bind' && userId) {
    await storage.set({ [COMPLETED_AT_KEY]: { at: decision.at, userId } })
    return decision.at
  }
  if (decision.action === 'use') return decision.at
  return null
}
