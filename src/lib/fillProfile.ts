import type { PersonalInfo } from '../types/index.ts'
import { completePersonalInfo } from './personalInfoDefaults.ts'
import { withTimeout } from '../utils/withTimeout.ts'

// How long a fill waits for the active profile before using the local mirror.
export const FILL_PROFILE_TIMEOUT_MS = 5000

export type FillProfileSources = {
  // get_profile mapped the same way the popup maps it. null means that read
  // did not succeed (offline, signed out, timed out).
  active: PersonalInfo | null
  // chrome.storage.local personalInfo. It can still hold an older resume parse.
  mirror: unknown
  // chrome.storage.local resumeUploadJob, or any other leftover parse blob.
  // Never a source for company, title, or any other filled field.
  parsedResume: unknown
}

// The popup shows work_experience child rows. A fill must use that same object
// when it is available, including an empty experience list after the user
// cleared jobs. The storage mirror and a leftover parse are not merged in.
export function resolveFillPersonalInfo(sources: FillProfileSources): PersonalInfo {
  // Naming the parse keeps the refusal in the type and stops a caller from
  // filling company or title from resumeUploadJob when the profile was cleared.
  const ignoredParsedResume = sources.parsedResume
  void ignoredParsedResume
  if (sources.active) return completePersonalInfo(sources.active)
  return completePersonalInfo(sources.mirror as Partial<PersonalInfo> | null | undefined)
}

export function activePersonalInfoFromMessage(message: unknown): PersonalInfo | null {
  if (!message || typeof message !== 'object') return null
  const record = message as { ok?: unknown; personalInfo?: unknown }
  if (record.ok !== true || !record.personalInfo || typeof record.personalInfo !== 'object') return null
  return completePersonalInfo(record.personalInfo as Partial<PersonalInfo>)
}

export async function loadFillPersonalInfo(input: {
  mirror: unknown
  parsedResume: unknown
  requestActive: () => Promise<unknown>
  timeoutMs?: number
}): Promise<PersonalInfo> {
  const pending = Promise.resolve().then(() => input.requestActive())
  const message = await withTimeout(pending, input.timeoutMs ?? FILL_PROFILE_TIMEOUT_MS, null)
  return resolveFillPersonalInfo({
    active: activePersonalInfoFromMessage(message),
    mirror: input.mirror,
    parsedResume: input.parsedResume,
  })
}
