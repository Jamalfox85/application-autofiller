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
