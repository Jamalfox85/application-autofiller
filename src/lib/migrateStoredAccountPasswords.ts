// One-shot rewrite of legacy plaintext account passwords. Safe to call on every
// sign-in and every service-worker start: already-sealed values are not rewritten.
import { ensureAccountKey } from './accountKey.ts'
import { accountPasswordsNeedSeal, migrateAccountPasswords } from './accountSecrets.ts'
import { saveProfileToDb } from './sync/profile.ts'
import { ACTIVE_PROFILE_KEY, parseActiveProfile } from './sync/activeProfile.ts'
import type { PersonalInfo } from '../types/index.ts'

export async function migrateStoredAccountPasswords(): Promise<void> {
  const key = await ensureAccountKey()
  if (!key) return
  let stored: unknown
  let active: unknown
  try {
    const data = await chrome.storage.local.get(['personalInfo', ACTIVE_PROFILE_KEY])
    stored = data.personalInfo
    active = data[ACTIVE_PROFILE_KEY]
  } catch {
    return
  }
  if (!stored || typeof stored !== 'object' || !accountPasswordsNeedSeal(stored as PersonalInfo)) return

  const migrated = await migrateAccountPasswords(stored as PersonalInfo, key)
  if (!migrated.changed) return
  try {
    await chrome.storage.local.set({ personalInfo: migrated.sealed })
  } catch {
    console.error('Could not encrypt saved account passwords')
    return
  }

  const profileId = parseActiveProfile(active)?.id ?? null
  if (!profileId) return
  try {
    await saveProfileToDb(migrated.sealed, profileId)
  } catch {
    console.error('Could not encrypt saved account passwords')
  }
}
