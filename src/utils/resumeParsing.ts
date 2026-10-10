import { cloneDefaultPersonalInfo } from '../lib/personalInfoDefaults.ts'
import type { ParsedResumeData, PersonalInfo } from '../types/index.ts'

function assignEntryIds<T extends { id?: number }>(entries: T[]): (T & { id: number })[] {
  let nextId = Date.now()
  return entries.map((entry) => ({ ...entry, id: nextId++ }))
}

// Merges a backend resume-parse result into a full PersonalInfo, assigning client-side ids
// to education/experience entries (the backend has no concept of these).
export function mergeParsedResume(
  parsed: ParsedResumeData,
  options?: { fileName?: string },
): PersonalInfo {
  return {
    ...cloneDefaultPersonalInfo(),
    ...parsed,
    resumeFileName: options?.fileName ?? parsed.resumeFileName,
    education: assignEntryIds(parsed.education ?? []),
    experience: assignEntryIds(parsed.experience ?? []),
    skills: parsed.skills ?? [],
  }
}

// Overlay a fresh parse onto an existing profile — keeps accounts, custom links, etc.
export function mergeParsedResumeIntoProfile(
  existing: PersonalInfo,
  parsed: ParsedResumeData,
  fileName?: string,
): PersonalInfo {
  const { education, experience, skills, fieldNotes, ...scalarFields } = parsed

  return {
    ...existing,
    ...scalarFields,
    resumeFileName: fileName ?? existing.resumeFileName,
    education: education?.length ? assignEntryIds(education) : existing.education,
    experience: experience?.length ? assignEntryIds(experience) : existing.experience,
    skills: skills?.length ? skills : existing.skills,
  }
}

// True when the profile holds something the user (or a previous parse) really entered. The
// account email is seeded at sign-up, so email alone must not count: it used to make the
// first resume upload look like a repeat upload and its parse was thrown away.
export function profileHasUserData(p: PersonalInfo | null | undefined): boolean {
  if (!p) return false
  return !!(
    p.firstName ||
    p.lastName ||
    p.phone ||
    p.address ||
    p.city ||
    (p.experience?.length ?? 0) > 0 ||
    (p.education?.length ?? 0) > 0 ||
    (p.skills?.length ?? 0) > 0
  )
}
