import {
  ICON_USER,
  ICON_EDIT,
  ICON_SOCIAL_LINKS,
  ICON_EXPERIENCE,
  ICON_EDUCATION,
  ICON_EEO,
  ICON_OTHER_DETAILS,
  ICON_PASSWORD,
  ICON_STARS,
} from '@/utils/icons'
import type { PersonalInfo } from '@/types'

export interface SectionDef {
  num: string
  key: string
  title: string
  dialog: string
  icon: string
  meta: (info: PersonalInfo) => string
  done: (info: PersonalInfo) => boolean
  required: boolean
}

// The 8-row main-popup section list. 01-06 mirror the design's core sections; 07/08
// (Custom Responses, Application Accounts) are additions the design doesn't show but that
// are real, working features — kept as extra rows rather than folded in or dropped.
export const SECTIONS: SectionDef[] = [
  {
    num: '01',
    key: 'personal',
    title: 'Personal details',
    dialog: 'personalInfo',
    icon: ICON_USER,
    required: true,
    meta: (info) => (info.city && info.state ? `${info.city}, ${info.state}` : 'Name, address'),
    done: (info) => !!(info.firstName && info.lastName && info.email),
  },
  {
    num: '02',
    key: 'experience',
    title: 'Work experience',
    dialog: 'experience',
    icon: ICON_EXPERIENCE,
    required: true,
    meta: (info) => {
      const count = info.experience?.length || 0
      return count > 0 ? `${count} role${count === 1 ? '' : 's'}` : 'Add your most recent role'
    },
    done: (info) => (info.experience?.length || 0) > 0,
  },
  {
    num: '03',
    key: 'education',
    title: 'Education',
    dialog: 'education',
    icon: ICON_EDUCATION,
    required: false,
    meta: (info) => {
      const count = info.education?.length || 0
      return count > 0 ? `${count} school${count === 1 ? '' : 's'}` : 'School, degree, dates'
    },
    done: (info) => (info.education?.length || 0) > 0,
  },
  {
    num: '04',
    key: 'links',
    title: 'Links & files',
    dialog: 'links',
    icon: ICON_SOCIAL_LINKS,
    required: false,
    meta: (info) => {
      const parts: string[] = []
      if (info.resumeFileName) parts.push('Resumé on file')
      const linkCount =
        [info.linkedin, info.website, info.github].filter(Boolean).length +
        (info.otherLinks?.filter((l) => l.url).length ?? 0)
      if (linkCount > 0) parts.push(`${linkCount} link${linkCount === 1 ? '' : 's'}`)
      return parts.length > 0 ? parts.join(' · ') : 'Resumé, portfolio, LinkedIn'
    },
    done: (info) =>
      !!(info.resumeFileName || info.linkedin || info.website || info.github),
  },
  {
    num: '05',
    key: 'authorization',
    title: 'Work authorization',
    dialog: 'otherDetails',
    icon: ICON_OTHER_DETAILS,
    required: false,
    meta: (info) => {
      if (!info.workAuthorization) return 'Eligibility and notice period'
      if (info.noticePeriod) return `${info.noticePeriod} notice`
      return 'Complete'
    },
    done: (info) => !!info.workAuthorization,
  },
  {
    num: '06',
    key: 'demographics',
    title: 'Demographics',
    dialog: 'eeoInfo',
    icon: ICON_EEO,
    required: false,
    meta: (info) =>
      info.eeoAnswersEnabled === false ? 'Skipped on forms' : 'Answered only when asked',
    done: (info) =>
      info.eeoAnswersEnabled === false ||
      !!(info.gender || info.raceEthnicity || info.veteranStatus || info.disabilityStatus),
  },
  {
    num: '07',
    key: 'skills',
    title: 'Skills',
    dialog: 'skills',
    icon: ICON_STARS,
    required: false,
    meta: (info) => {
      const count = info.skills?.length || 0
      return count > 0 ? `${count} skill${count === 1 ? '' : 's'}` : 'List your key skills'
    },
    done: (info) => (info.skills?.length || 0) > 0,
  },
  {
    num: '08',
    key: 'customResponses',
    title: 'Custom responses',
    dialog: 'customResponses',
    icon: ICON_EDIT,
    required: false,
    meta: () => 'Tailor responses for specific questions',
    done: () => false,
  },
  {
    num: '09',
    key: 'applicationAccount',
    title: 'Application accounts',
    dialog: 'applicationAccount',
    icon: ICON_PASSWORD,
    required: false,
    meta: (info) => {
      const count = info.applicationAccounts?.length || 0
      return count > 0 ? `${count} account${count === 1 ? '' : 's'}` : 'Logins for job portals'
    },
    done: (info) => (info.applicationAccounts?.length || 0) > 0,
  },
]

// The 7 core sections used by the manual-entry onboarding wizard (1g/1h) — Custom Responses
// and Application Accounts aren't part of the design's required checklist.
const EXTRA_SECTION_KEYS = ['customResponses', 'applicationAccount']
export const CORE_SECTIONS = SECTIONS.filter((s) => !EXTRA_SECTION_KEYS.includes(s.key))
