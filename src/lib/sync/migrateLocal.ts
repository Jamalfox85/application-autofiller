// One-time migration of pre-Supabase local data into the user's account.
//
// Before this release, profile data / custom responses / fill history lived only in
// chrome.storage.local. Existing users already have that data on their device but nothing in
// Supabase. On the first signed-in launch after upgrading, push it up so it isn't stranded.
//
// TEMPORARY: this exists to protect current users through the cutover. Once the install base
// has upgraded it (and the `${MIGRATION_FLAG}` check) can be deleted.
import { readMirror } from './shared'
import {
  fetchProfileFromDb,
  profileHasSubstance,
  saveProfileToDb,
} from './profile'
import { fetchCustomResponsesFromDb, saveCustomResponsesToDb } from './customResponses'
import { reconcileFillHistory } from './fillHistory'
import type { CustomResponse, FillHistoryEntry, PersonalInfo } from '../../types'

const MIGRATION_FLAG = 'localToSupabaseMigrated_v1'

// App.vue can call this twice in quick succession on launch (onMounted + the auth watcher
// both fire for a restored session). Coalesce those into one attempt per popup load.
let inFlight: Promise<void> | null = null

export function migrateLocalDataToSupabase(userId: string): Promise<void> {
  if (!inFlight) {
    inFlight = runMigration(userId).finally(() => {
      inFlight = null
    })
  }
  return inFlight
}

async function runMigration(userId: string): Promise<void> {
  const flag = await chrome.storage.local.get(MIGRATION_FLAG)
  if (flag[MIGRATION_FLAG]) return

  try {
    await migrateProfile(userId)
    await migrateCustomResponses(userId)
    await migrateFillHistory(userId)
    await chrome.storage.local.set({ [MIGRATION_FLAG]: true })
  } catch (error) {
    // Leave the flag unset so the next launch retries. Local data is untouched, so nothing
    // is lost by trying again.
    console.error('Local -> Supabase migration failed; will retry next launch', error)
  }
}

async function migrateProfile(userId: string): Promise<void> {
  const local = await readMirror<PersonalInfo>('personalInfo')
  if (!profileHasSubstance(local)) return

  const remote = await fetchProfileFromDb(userId)
  // Don't clobber a profile the user has already built up on another device.
  if (profileHasSubstance(remote, { ignoreEmail: true })) return

  await saveProfileToDb(local as PersonalInfo, userId)
}

async function migrateCustomResponses(userId: string): Promise<void> {
  const local = await readMirror<CustomResponse[]>('customResponses')
  if (!local?.length) return

  const remote = await fetchCustomResponsesFromDb(userId)
  if (remote.length) return

  await saveCustomResponsesToDb(userId, local)
}

async function migrateFillHistory(userId: string): Promise<void> {
  const local = await readMirror<FillHistoryEntry[]>('fillHistory')
  if (!local?.length) return
  // reconcileFillHistory only inserts entries missing from the remote set, so this is safe to
  // run even if some rows already made it up.
  await reconcileFillHistory(userId, local)
}
