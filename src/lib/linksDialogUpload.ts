import type { PersonalInfo } from '../types/index.ts'

// The Links dialog edits links and the resume. When a resume upload finishes,
// the profile it saves is the latest saved copy (so a sync that landed while
// the dialog was open is not undone) with the links as the dialog has them now.
// Building it from the saved copy alone dropped link edits not saved yet.
export function linksDialogUploadBase(saved: PersonalInfo, edited: PersonalInfo): PersonalInfo {
  return {
    ...saved,
    linkedin: edited.linkedin,
    website: edited.website,
    github: edited.github,
    otherLinks: (edited.otherLinks ?? []).map((link) => ({ ...link })),
  }
}

// Picking a resume from the toolbar popup opens an upload tab and closes the
// popup, which drops anything typed and not saved. The dialog writes its links
// here first (storage is quick enough to finish before the popup closes) and
// uses them when the upload finishes or the dialog opens again.
export const LINKS_DRAFT_KEY = 'gofillr.linksDraft'
export const LINKS_DRAFT_TTL_MS = 30 * 60 * 1000

export type LinksDraft = Pick<PersonalInfo, 'linkedin' | 'website' | 'github'> & {
  otherLinks: NonNullable<PersonalInfo['otherLinks']>
  at: number
}

export function linksDraftFrom(info: PersonalInfo, now = Date.now()): LinksDraft {
  return {
    linkedin: info.linkedin,
    website: info.website,
    github: info.github,
    otherLinks: (info.otherLinks ?? []).map((link) => ({ ...link })),
    at: now,
  }
}

export function freshLinksDraft(value: unknown, now = Date.now()): LinksDraft | null {
  if (!value || typeof value !== 'object') return null
  const draft = value as Partial<LinksDraft>
  if (typeof draft.at !== 'number' || now - draft.at < 0 || now - draft.at > LINKS_DRAFT_TTL_MS) return null
  return {
    linkedin: typeof draft.linkedin === 'string' ? draft.linkedin : '',
    website: typeof draft.website === 'string' ? draft.website : '',
    github: typeof draft.github === 'string' ? draft.github : '',
    otherLinks: Array.isArray(draft.otherLinks) ? draft.otherLinks.map((link) => ({ ...link })) : [],
    at: draft.at,
  }
}

export function applyLinksDraft(info: PersonalInfo, draft: LinksDraft | null): PersonalInfo {
  if (!draft) return info
  return linksDialogUploadBase(info, { ...info, ...draft })
}

export function linksDiffer(left: PersonalInfo, right: PersonalInfo): boolean {
  const key = (info: PersonalInfo) =>
    JSON.stringify([info.linkedin || '', info.website || '', info.github || '', info.otherLinks ?? []])
  return key(left) !== key(right)
}

const REVIEW_FIELDS = [
  'firstName',
  'middleName',
  'lastName',
  'email',
  'phone',
  'address',
  'city',
  'state',
  'zip',
  'country',
] as const

// A resume read fills blanks. Send the person to review only when it filled
// personal details, work history or education. An established profile usually
// gains nothing there, and jumping away from Links lost their place.
export function resumeFilledReviewableFields(before: PersonalInfo, after: PersonalInfo): boolean {
  const record = (info: PersonalInfo) => info as unknown as Record<string, unknown>
  for (const field of REVIEW_FIELDS) {
    if ((record(before)[field] ?? '') !== (record(after)[field] ?? '')) return true
  }
  if (JSON.stringify(before.experience ?? []) !== JSON.stringify(after.experience ?? [])) return true
  if (JSON.stringify(before.education ?? []) !== JSON.stringify(after.education ?? [])) return true
  return false
}
