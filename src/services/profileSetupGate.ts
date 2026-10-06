// Decides when the popup may leave Welcome, and when Match Score may run.
//
// A brand-new account often already has one profile row (handle_new_user seeds the auth
// email). That row is not proof of setup — Welcome stays until the user saves real profile
// data, finishes or skips onboarding, or already has more than one profile. The last case
// is the multi-profile bug: the active profile (for example a just-created "Primary copy")
// can have empty first/last names while the roster is long past first-run.
import type { PersonalInfo } from '../types/index.ts'
import {
  PERSONAL_INFO_KEY,
  readActiveProfile,
  type StorageAreaLike,
} from '../lib/sync/activeProfile.ts'
import { profileHasSubstance } from '../lib/sync/profileRows.ts'
import {
  completeProfileSetupSession,
  getProfileSetupCompletedAt,
} from './profileSetupSession.ts'

export interface PopupLoadState {
  personalInfo?: PersonalInfo | null
  // list_profiles length, or the activeProfile mirror count when the list has not loaded.
  profileCount: number
  // A roster row already has a resume or hint, even when the active mirror's names are empty.
  rosterHasSavedWork?: boolean
  setupCompletedAt?: number | null
}

export function accountSetupEstablished(input: {
  personalInfo?: PersonalInfo | null
  profileCount: number
  rosterHasSavedWork?: boolean
}): boolean {
  if (input.profileCount > 1) return true
  if (input.rosterHasSavedWork) return true
  return profileHasSubstance(input.personalInfo, { ignoreEmail: true })
}

// What loadAppState should show. Default remains Welcome for an empty first-run account.
export function resolvePopupView(input: PopupLoadState): 'main' | 'welcome' {
  if (input.setupCompletedAt) return 'main'
  if (accountSetupEstablished(input)) return 'main'
  return 'welcome'
}

// Existing installs that finished setup before the flag existed (or skipped without writing
// it) get profileSetupCompletedAt the next time the popup can see they are past first-run.
// Does not overwrite a timestamp that is already stored.
export async function healProfileSetupCompletion(
  storage: StorageAreaLike,
  input: {
    personalInfo?: PersonalInfo | null
    profileCount: number
    rosterHasSavedWork?: boolean
  },
): Promise<void> {
  if (!accountSetupEstablished(input)) return
  await completeProfileSetupSession(storage)
}

export async function matchScoreSetupReady(
  storage: StorageAreaLike = chrome.storage.local,
): Promise<boolean> {
  const completedAt = await getProfileSetupCompletedAt(storage)
  const active = await readActiveProfile(storage)
  let personalInfo: PersonalInfo | null = null
  try {
    const data = await storage.get(PERSONAL_INFO_KEY)
    const value = data[PERSONAL_INFO_KEY]
    if (value && typeof value === 'object') personalInfo = value as PersonalInfo
  } catch {
    personalInfo = null
  }
  return (
    resolvePopupView({
      personalInfo,
      profileCount: active?.profileCount ?? 0,
      setupCompletedAt: completedAt,
    }) === 'main'
  )
}
