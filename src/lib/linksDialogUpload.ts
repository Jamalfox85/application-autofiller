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
