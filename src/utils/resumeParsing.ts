import { cloneDefaultPersonalInfo } from '../lib/personalInfoDefaults'
import type { ParsedResumeData, PersonalInfo } from '../types'

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
