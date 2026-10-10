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

const isBlank = (v: unknown) => v == null || (typeof v === 'string' && v.trim() === '')
const norm = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

// Fill only what is empty. A re-parse of the same resume must never overwrite what the user
// typed or edited; it just completes the blanks (phone, GitHub, degree...). Entries are paired
// by school / company+title; entries the profile does not have yet are only added when the
// profile has none of that kind at all.
export function fillEmptyFromParsedResume(
  existing: PersonalInfo,
  parsed: ParsedResumeData,
  fileName?: string,
): PersonalInfo {
  const { education, experience, skills, fieldNotes: _notes, ...scalars } = parsed
  const next: Record<string, unknown> = { ...existing }
  const skip = new Set(['resumeFileName', 'resumeFilePath', 'phoneCountryCode', 'eeoAnswersEnabled'])
  for (const [key, value] of Object.entries(scalars)) {
    if (skip.has(key) || isBlank(value)) continue
    if (isBlank((existing as unknown as Record<string, unknown>)[key])) next[key] = value
  }
  // "+1" is the seeded default, so it only counts as the user's when a phone is already saved.
  if (isBlank(existing.phone) && !isBlank(parsed.phone) && !isBlank(parsed.phoneCountryCode)) {
    next.phoneCountryCode = parsed.phoneCountryCode
  }
  if (fileName) next.resumeFileName = fileName

  const fillEntry = <T extends object>(have: T, incoming: T): T => {
    const out: Record<string, unknown> = { ...have }
    for (const [k, v] of Object.entries(incoming as Record<string, unknown>)) {
      if (k === 'id' || isBlank(v)) continue
      const current = out[k]
      if (isBlank(current) || current === false) out[k] = v
    }
    return out as T
  }

  const haveEdu = existing.education ?? []
  if (haveEdu.length === 0) {
    next.education = assignEntryIds(education ?? [])
  } else if (education?.length) {
    next.education = haveEdu.map((e) => {
      const match = education.find((p) => norm(p.schoolName) && norm(p.schoolName) === norm(e.schoolName))
        ?? (haveEdu.length === 1 && education.length === 1 ? education[0] : undefined)
      return match ? fillEntry(e, match) : e
    })
  }

  const haveExp = existing.experience ?? []
  if (haveExp.length === 0) {
    next.experience = assignEntryIds(experience ?? [])
  } else if (experience?.length) {
    next.experience = haveExp.map((e) => {
      const match = experience.find(
        (p) => norm(p.companyName) && norm(p.companyName) === norm(e.companyName) && norm(p.jobTitle) === norm(e.jobTitle),
      ) ?? experience.find((p) => norm(p.companyName) && norm(p.companyName) === norm(e.companyName))
      return match ? fillEntry(e, match) : e
    })
  }

  if ((existing.skills ?? []).length === 0) next.skills = skills ?? []
  return next as unknown as PersonalInfo
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
