import { ref } from 'vue'
import type { CustomResponse, PersonalInfo } from '../types'
import { DEFAULT_PERSONAL_INFO, cloneDefaultPersonalInfo } from '../lib/personalInfoDefaults'
import { getUserIdOrNull, readMirror, writeMirror } from '../lib/sync/shared'
import { mirrorEpoch, onMirrorReset } from '../lib/sync/mirrorEpoch'
import { fetchProfileBundle, saveProfileToDb } from '../lib/sync/profile'
import { ensureAccountKey } from '../lib/accountKey'
import {
  blankSealedPasswords,
  hasSealedPassword,
  lockSealedPasswords,
  migrateAccountPasswords,
  restoreLockedPasswords,
  type LockedPasswords,
} from '../lib/accountSecrets'
import { shouldWriteProfileLoad } from '../lib/profileLoadGuard'
import { noteCustomResponses } from './useCustomResponses'
import {
  CUSTOM_RESPONSES_KEY,
  PERSONAL_INFO_KEY,
  readActiveProfileId,
  writeProfileMirrors,
  type ActiveProfileMirror,
} from '../lib/sync/activeProfile'

// Re-exported for existing import sites (src/utils/resumeParsing.ts, etc.).
export { DEFAULT_PERSONAL_INFO, cloneDefaultPersonalInfo }

let resumeMirrorListener = false
let loadSerial = 0

// Shared by every caller. A dialog that still holds the previous account's profile
// must not save it after sign-out or after the mirror key is removed.
const personalInfo = ref<PersonalInfo>(cloneDefaultPersonalInfo())
const loadedProfileId = ref<string | null>(null)
let memoryValid = true
let memoryGeneration = 0
// Ciphertext we could not open. A blank password field in the editor must not
// overwrite these on the next save.
let lockedPasswords: LockedPasswords | null = null

function invalidatePersonalInfoMemory() {
  memoryGeneration += 1
  memoryValid = false
  lockedPasswords = null
  personalInfo.value = cloneDefaultPersonalInfo()
  loadedProfileId.value = null
}

onMirrorReset(invalidatePersonalInfoMemory)

export function usePersonalInfo() {
  // The profile `personalInfo` was loaded from. Saves always go back to this id, never to
  // whatever the mirror says at save time, so an edit can't land on a different profile.

  // The service worker writes the mirror after it stores the resume. Fold just
  // those fields into the open popup so a later Save does not drop them.
  if (!resumeMirrorListener && typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    resumeMirrorListener = true
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !Object.prototype.hasOwnProperty.call(changes, PERSONAL_INFO_KEY)) return
      if (changes[PERSONAL_INFO_KEY].newValue == null) {
        invalidatePersonalInfoMemory()
        return
      }
      if (!memoryValid) return
      const next = changes[PERSONAL_INFO_KEY].newValue as PersonalInfo
      const path = next?.resumeFilePath
      if (!path || path === personalInfo.value.resumeFilePath) return
      personalInfo.value = {
        ...personalInfo.value,
        resumeFileName: next.resumeFileName || personalInfo.value.resumeFileName,
        resumeFilePath: path,
      }
    })
  }

  // Supabase is the source of truth. Loads `active` (from list_profiles) and rewrites all
  // three mirrors the content script reads in one storage write:
  //   - get_profile succeeds  → use it, overwrite personalInfo + customResponses + activeProfile
  //   - get_profile throws    → offline: fall back to the mirror so the popup still shows the
  //                             last-known profile (and keeps saving to that profile's id)
  const loadPersonalInfo = async (active?: ActiveProfileMirror | null): Promise<PersonalInfo | null> => {
    const loadId = ++loadSerial
    const epoch = mirrorEpoch()
    const generation = memoryGeneration
    const stillCurrent = () =>
      loadId === loadSerial && epoch === mirrorEpoch() && generation === memoryGeneration
    // A newer load owns memory. Sign-out still drops it, but only on the latest load.
    const abandon = (): null => {
      if (loadId === loadSerial && (epoch !== mirrorEpoch() || generation !== memoryGeneration)) {
        invalidatePersonalInfoMemory()
      }
      return null
    }
    const userId = await getUserIdOrNull()
    if (!stillCurrent()) return abandon()

    if (userId) {
      try {
        const bundle = await fetchProfileBundle(active?.id ?? null)
        if (!stillCurrent()) return abandon()
        const intendedId = active?.id || bundle.id || null
        const mirroredId = await readActiveProfileId(chrome.storage.local)
        if (!stillCurrent()) return abandon()
        if (!shouldWriteProfileLoad(intendedId, mirroredId)) return null

        const key = await ensureAccountKey()
        if (!stillCurrent()) return abandon()
        const migrated = key ? await migrateAccountPasswords(bundle.personalInfo, key) : null
        const opened =
          migrated?.opened ??
          (hasSealedPassword(bundle.personalInfo)
            ? blankSealedPasswords(bundle.personalInfo)
            : bundle.personalInfo)
        const stored = migrated?.sealed ?? bundle.personalInfo
        personalInfo.value = { ...cloneDefaultPersonalInfo(), ...opened }
        lockedPasswords = migrated ? migrated.locked : lockSealedPasswords(bundle.personalInfo)
        loadedProfileId.value = bundle.id
        memoryValid = true
        noteCustomResponses(bundle.customResponses, bundle.id)
        if (!stillCurrent()) return abandon()
        await writeProfileMirrors(chrome.storage.local, {
          personalInfo: stored,
          customResponses: bundle.customResponses,
          activeProfile: active ?? { id: bundle.id, name: bundle.name, profileCount: 1 },
        })
        if (!stillCurrent()) return abandon()
        if (migrated?.changed && bundle.id) {
          try {
            await saveProfileToDb(stored, bundle.id)
          } catch {
            console.error('Could not encrypt saved account passwords')
          }
        }
        if (!stillCurrent()) return abandon()
        return personalInfo.value
      } catch (error) {
        console.error('Failed to load profile from Supabase — using local cache', error)
      }
    }

    if (!stillCurrent()) return abandon()
    const local = await readMirror<PersonalInfo>(PERSONAL_INFO_KEY)
    if (!stillCurrent()) return abandon()
    const mirroredId = await readActiveProfileId(chrome.storage.local)
    if (!stillCurrent()) return abandon()
    if (!shouldWriteProfileLoad(active?.id ?? mirroredId, mirroredId)) return null
    const offlineKey = userId ? await ensureAccountKey() : null
    if (!stillCurrent()) return abandon()
    const migrated = offlineKey && local ? await migrateAccountPasswords(local, offlineKey) : null
    const opened =
      migrated?.opened ?? (local && hasSealedPassword(local) ? blankSealedPasswords(local) : local)
    if (opened) {
      personalInfo.value = { ...cloneDefaultPersonalInfo(), ...opened }
    } else if (!memoryValid) {
      personalInfo.value = cloneDefaultPersonalInfo()
    }
    lockedPasswords = migrated ? migrated.locked : lockSealedPasswords(local)
    loadedProfileId.value = mirroredId
    memoryValid = true
    if (migrated?.changed && mirroredId && stillCurrent()) {
      try {
        await writeMirror(PERSONAL_INFO_KEY, migrated.sealed)
        if (userId) await saveProfileToDb(migrated.sealed, mirroredId)
      } catch {
        console.error('Could not encrypt saved account passwords')
      }
    }
    const localResponses = await readMirror<CustomResponse[]>(CUSTOM_RESPONSES_KEY)
    if (!stillCurrent()) return abandon()
    noteCustomResponses(localResponses ?? [], loadedProfileId.value)
    return personalInfo.value
  }

  // Writes the local mirror first (so autofill and a reopened popup see the change even if
  // the network call is slow or fails), then saves the loaded profile via save_profile.
  // Throws if the Supabase write fails — callers decide how loudly to surface that.
  const savePersonalInfo = async (updatedInfo?: PersonalInfo, opts?: { fromResumeParse?: boolean }) => {
    if (!memoryValid) return
    const epoch = mirrorEpoch()
    const generation = memoryGeneration
    if (updatedInfo) {
      personalInfo.value = { ...personalInfo.value, ...updatedInfo }
    }

    const snapshot = restoreLockedPasswords(
      JSON.parse(JSON.stringify(personalInfo.value)) as PersonalInfo,
      lockedPasswords,
    )
    const profileId = loadedProfileId.value ?? (await readActiveProfileId(chrome.storage.local))
    if (!memoryValid || generation !== memoryGeneration || epoch !== mirrorEpoch()) return
    const key = await ensureAccountKey()
    if (!memoryValid || generation !== memoryGeneration || epoch !== mirrorEpoch()) return
    const stored = key ? (await migrateAccountPasswords(snapshot, key)).sealed : snapshot
    const mirroredId = await readActiveProfileId(chrome.storage.local)
    if (!memoryValid || generation !== memoryGeneration || epoch !== mirrorEpoch()) return
    // Only touch the fill mirror when it still belongs to the profile being edited.
    if (!mirroredId || mirroredId === profileId) {
      await writeMirror(PERSONAL_INFO_KEY, stored)
    }

    const userId = await getUserIdOrNull()
    if (!memoryValid || generation !== memoryGeneration || epoch !== mirrorEpoch() || !userId || !profileId) return

    await saveProfileToDb(stored, profileId, opts)
  }

  return {
    personalInfo,
    loadedProfileId,
    loadPersonalInfo,
    savePersonalInfo,
  }
}
