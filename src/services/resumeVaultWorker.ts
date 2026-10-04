// Service-worker side of resume save. Bundled by scripts/emit-install-attribution.mjs
// because background.js is copied as-is and is not a Vite entry.

import { cloneDefaultPersonalInfo } from '../lib/personalInfoDefaults'
import { saveResumeToAccount, type SavedResume } from '../lib/resumeVault'
import { supabasePublicConfigError } from '../lib/supabaseConfig'

export async function persistUploadedResume(input: {
  token: string
  fileName: string
  fileType: string
  bytes: Uint8Array
}): Promise<SavedResume> {
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  const configError = supabasePublicConfigError(url, anonKey)
  if (configError || !url || !anonKey) {
    throw new Error("Resume saving isn't set up on this build. Please contact support.")
  }

  const saved = await saveResumeToAccount({
    supabaseUrl: url,
    anonKey,
    accessToken: input.token,
    fileName: input.fileName,
    fileType: input.fileType,
    bytes: input.bytes,
  })

  try {
    await rememberSavedResume(saved.fileName, saved.storagePath)
  } catch (error) {
    // The account row is the source of truth. The popup reloads it on the next open.
    console.error(
      '[resume-upload] saved to the account but could not refresh the local copy',
      error,
    )
  }

  return saved
}

async function rememberSavedResume(fileName: string, storagePath: string): Promise<void> {
  const stored = await chrome.storage.local.get('personalInfo')
  const current = stored.personalInfo
  const base = current && typeof current === 'object' ? current : cloneDefaultPersonalInfo()
  await chrome.storage.local.set({
    personalInfo: {
      ...base,
      resumeFileName: fileName,
      resumeFilePath: storagePath,
    },
  })
}
