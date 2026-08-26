// src/services/profileSetupSession.ts
//
// Bridges profile_setup_started (fired from PickPath.vue, when the user picks a path) and
// profile_setup_completed (fired later from Welcome.vue, once onboarding finishes) so the
// completed event can report how long setup took. Kept in chrome.storage.local rather than
// component state since the popup can close mid-onboarding and reopen later.
const SESSION_KEY = 'profileSetupSession'
const COMPLETED_AT_KEY = 'profileSetupCompletedAt'

interface ProfileSetupSession {
  id: string
  startedAt: number
}

export async function startProfileSetupSession(): Promise<ProfileSetupSession> {
  const session: ProfileSetupSession = { id: crypto.randomUUID(), startedAt: Date.now() }
  await chrome.storage.local.set({ [SESSION_KEY]: session })
  return session
}

export async function getProfileSetupSession(): Promise<ProfileSetupSession | null> {
  const data = await chrome.storage.local.get(SESSION_KEY)
  return data[SESSION_KEY] ?? null
}

export async function completeProfileSetupSession(): Promise<void> {
  await chrome.storage.local.set({ [COMPLETED_AT_KEY]: Date.now() })
  await chrome.storage.local.remove(SESSION_KEY)
}

// Read by the content script to gate/time job_site_visit_detected.
export async function getProfileSetupCompletedAt(): Promise<number | null> {
  const data = await chrome.storage.local.get(COMPLETED_AT_KEY)
  return data[COMPLETED_AT_KEY] ?? null
}
