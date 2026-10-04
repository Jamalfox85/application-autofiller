// User-facing "Resume Matching Analysis" switch from the popup's Pro section.
// Stored in chrome.storage.local next to autoDetectEnabled. It only adds a
// condition on top of the build flags and the Pro entitlement check.

export const RESUME_MATCHING_KEY = 'resumeMatchingEnabled'
export const RESUME_MATCHING_DEFAULT = true

export function resumeMatchingEnabled(stored: unknown): boolean {
  return typeof stored === 'boolean' ? stored : RESUME_MATCHING_DEFAULT
}

export async function readResumeMatchingEnabled(): Promise<boolean> {
  try {
    const stored = await chrome.storage.local.get(RESUME_MATCHING_KEY)
    return resumeMatchingEnabled(stored[RESUME_MATCHING_KEY])
  } catch {
    return RESUME_MATCHING_DEFAULT
  }
}
