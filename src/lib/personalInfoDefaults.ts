import type { PersonalInfo } from '../types'

export const DEFAULT_PERSONAL_INFO: PersonalInfo = {
  firstName: '',
  middleName: '',
  lastName: '',
  email: '',
  phone: '',
  phoneCountryCode: '+1',
  address: '',
  addressLine2: '',
  city: '',
  state: '',
  zip: '',
  country: '',
  linkedin: '',
  website: '',
  github: '',
  resumeFileName: '',
  resumeFilePath: '',
  education: [],
  experience: [],
  skills: [],
  applicationAccounts: [],
  otherLinks: [],
  eeoAnswersEnabled: true,
  gender: '',
  raceEthnicity: '',
  disabilityStatus: '',
  veteranStatus: '',
  age18OrOlder: '',
  desiredSalary: '',
  salaryNegotiable: false,
  workAuthorization: '',
  sponsorshipRequired: '',
  noticePeriod: '',
  accountEmail: '',
  accountPassword: '',
}

// DEFAULT_PERSONAL_INFO's array fields are shared references — never spread it directly into
// live state. This always hands back fresh arrays so mutating one consumer's copy can't leak
// into another's.
export function cloneDefaultPersonalInfo(): PersonalInfo {
  return {
    ...DEFAULT_PERSONAL_INFO,
    education: [],
    experience: [],
    skills: [],
    applicationAccounts: [],
    otherLinks: [],
  }
}

// A profile object from storage, a half-loaded popup (`{}`) or a partial parse may lack the list
// fields. Dialogs read `.length` / `.push` on them, which threw "Cannot read properties of
// undefined (reading 'length')". Fill in whatever is missing or not an array; keep everything else.
export function completePersonalInfo(info: Partial<PersonalInfo> | null | undefined): PersonalInfo {
  const base = cloneDefaultPersonalInfo()
  const source = (info ?? {}) as Record<string, unknown>
  const out: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined) out[key] = value
  }
  for (const key of ['education', 'experience', 'skills', 'applicationAccounts', 'otherLinks'] as const) {
    if (!Array.isArray(out[key])) out[key] = []
  }
  return out as unknown as PersonalInfo
}
