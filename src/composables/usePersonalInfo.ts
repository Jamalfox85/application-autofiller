import { ref } from 'vue'
import type { PersonalInfo } from '../types'
import { DEFAULT_PERSONAL_INFO, cloneDefaultPersonalInfo } from '../lib/personalInfoDefaults'
import { getUserIdOrNull, readMirror, writeMirror } from '../lib/sync/shared'
import { fetchProfileFromDb, saveProfileToDb } from '../lib/sync/profile'

// Re-exported for existing import sites (src/utils/resumeParsing.ts, etc.).
export { DEFAULT_PERSONAL_INFO, cloneDefaultPersonalInfo }

const MIRROR_KEY = 'personalInfo'

let resumeMirrorListener = false

export function usePersonalInfo() {
  const personalInfo = ref<PersonalInfo>(cloneDefaultPersonalInfo())

  // The service worker writes the mirror after it stores the resume. Fold just
  // those fields into the open popup so a later Save does not drop them.
  if (!resumeMirrorListener && typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    resumeMirrorListener = true
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[MIRROR_KEY]?.newValue) return
      const next = changes[MIRROR_KEY].newValue as PersonalInfo
      const path = next?.resumeFilePath
      if (!path || path === personalInfo.value.resumeFilePath) return
      personalInfo.value = {
        ...personalInfo.value,
        resumeFileName: next.resumeFileName || personalInfo.value.resumeFileName,
        resumeFilePath: path,
      }
    })
  }

  // Supabase is the source of truth. We hydrate from it and refresh the chrome.storage.local
  // mirror the content script reads.
  //   - fetch succeeds with a row  → use it, overwrite the mirror
  //   - fetch succeeds, no row     → signed in but the profile was deleted (the
  //                                  handle_new_user trigger normally guarantees one). Treat
  //                                  as empty and clear the mirror; the row is recreated on
  //                                  the next save. Don't resurrect a stale local copy.
  //   - fetch throws (offline)     → fall back to the mirror so the popup still shows
  //                                  the last-known profile
  const loadPersonalInfo = async () => {
    const userId = await getUserIdOrNull()

    if (userId) {
      try {
        const remote = await fetchProfileFromDb(userId)
        personalInfo.value = remote
          ? { ...cloneDefaultPersonalInfo(), ...remote }
          : cloneDefaultPersonalInfo()
        await writeMirror(MIRROR_KEY, personalInfo.value)
        return personalInfo.value
      } catch (error) {
        console.error('Failed to load profile from Supabase — using local cache', error)
      }
    }

    const local = await readMirror<PersonalInfo>(MIRROR_KEY)
    if (local) {
      personalInfo.value = { ...personalInfo.value, ...local }
    }
    return personalInfo.value
  }

  // Writes the local mirror first (so autofill and a reopened popup see the change even if
  // the network call is slow or fails), then pushes to Supabase. Throws if the Supabase write
  // fails — callers decide how loudly to surface that.
  const savePersonalInfo = async (updatedInfo?: PersonalInfo) => {
    if (updatedInfo) {
      personalInfo.value = { ...personalInfo.value, ...updatedInfo }
    }

    const snapshot = JSON.parse(JSON.stringify(personalInfo.value)) as PersonalInfo
    await writeMirror(MIRROR_KEY, snapshot)

    const userId = await getUserIdOrNull()
    if (!userId) return

    await saveProfileToDb(snapshot, userId)
  }

  return {
    personalInfo,
    loadPersonalInfo,
    savePersonalInfo,
  }
}
