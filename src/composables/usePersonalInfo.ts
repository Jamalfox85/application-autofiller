import { ref } from 'vue'
import type { PersonalInfo } from '../types'
import { DEFAULT_PERSONAL_INFO, cloneDefaultPersonalInfo } from '../lib/personalInfoDefaults'
import { getUserIdOrNull, readMirror, writeMirror } from '../lib/sync/shared'
import { mirrorEpoch, onMirrorReset } from '../lib/sync/mirrorEpoch'
import { fetchProfileBundle, saveProfileToDb } from '../lib/sync/profile'
import {
  PERSONAL_INFO_KEY,
  readActiveProfileId,
  writeProfileMirrors,
  type ActiveProfileMirror,
} from '../lib/sync/activeProfile'

// Re-exported for existing import sites (src/utils/resumeParsing.ts, etc.).
export { DEFAULT_PERSONAL_INFO, cloneDefaultPersonalInfo }

let resumeMirrorListener = false

// Shared by every caller. A dialog that still holds the previous account's profile
// must not save it after sign-out or after the mirror key is removed.
const personalInfo = ref<PersonalInfo>(cloneDefaultPersonalInfo())
const loadedProfileId = ref<string | null>(null)
let memoryValid = true
let memoryGeneration = 0

function invalidatePersonalInfoMemory() {
  memoryGeneration += 1
  memoryValid = false
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
  const loadPersonalInfo = async (active?: ActiveProfileMirror | null) => {
    const epoch = mirrorEpoch()
    const generation = memoryGeneration
    const stillCurrent = () => epoch === mirrorEpoch() && generation === memoryGeneration
    const userId = await getUserIdOrNull()
    if (!stillCurrent()) return personalInfo.value

    if (userId) {
      try {
        const bundle = await fetchProfileBundle(active?.id ?? null)
        if (!stillCurrent()) return personalInfo.value
        personalInfo.value = { ...cloneDefaultPersonalInfo(), ...bundle.personalInfo }
        loadedProfileId.value = bundle.id
        memoryValid = true
        if (!stillCurrent()) {
          invalidatePersonalInfoMemory()
          return personalInfo.value
        }
        await writeProfileMirrors(chrome.storage.local, {
          personalInfo: personalInfo.value,
          customResponses: bundle.customResponses,
          activeProfile: active ?? { id: bundle.id, name: bundle.name, profileCount: 1 },
        })
        if (!stillCurrent()) invalidatePersonalInfoMemory()
        return personalInfo.value
      } catch (error) {
        console.error('Failed to load profile from Supabase — using local cache', error)
      }
    }

    if (!stillCurrent()) return personalInfo.value
    const local = await readMirror<PersonalInfo>(PERSONAL_INFO_KEY)
    if (!stillCurrent()) return personalInfo.value
    if (local) {
      personalInfo.value = { ...cloneDefaultPersonalInfo(), ...local }
    } else if (!memoryValid) {
      personalInfo.value = cloneDefaultPersonalInfo()
    }
    loadedProfileId.value = await readActiveProfileId(chrome.storage.local)
    if (!stillCurrent()) return personalInfo.value
    memoryValid = true
    return personalInfo.value
  }

  // Writes the local mirror first (so autofill and a reopened popup see the change even if
  // the network call is slow or fails), then saves the loaded profile via save_profile.
  // Throws if the Supabase write fails — callers decide how loudly to surface that.
  const savePersonalInfo = async (updatedInfo?: PersonalInfo) => {
    if (!memoryValid) return
    const epoch = mirrorEpoch()
    const generation = memoryGeneration
    if (updatedInfo) {
      personalInfo.value = { ...personalInfo.value, ...updatedInfo }
    }

    const snapshot = JSON.parse(JSON.stringify(personalInfo.value)) as PersonalInfo
    const profileId = loadedProfileId.value ?? (await readActiveProfileId(chrome.storage.local))
    if (!memoryValid || generation !== memoryGeneration || epoch !== mirrorEpoch()) return
    const mirroredId = await readActiveProfileId(chrome.storage.local)
    if (!memoryValid || generation !== memoryGeneration || epoch !== mirrorEpoch()) return
    // Only touch the fill mirror when it still belongs to the profile being edited.
    if (!mirroredId || mirroredId === profileId) {
      await writeMirror(PERSONAL_INFO_KEY, snapshot)
    }

    const userId = await getUserIdOrNull()
    if (!memoryValid || generation !== memoryGeneration || epoch !== mirrorEpoch() || !userId || !profileId) return

    await saveProfileToDb(snapshot, profileId)
  }

  return {
    personalInfo,
    loadedProfileId,
    loadPersonalInfo,
    savePersonalInfo,
  }
}
