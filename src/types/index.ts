export interface PersonalInfo {
  firstName: string
  middleName?: string
  lastName: string
  email: string
  phone: string
  phoneCountryCode?: string
  address: string
  addressLine2?: string
  city: string
  state: string
  zip: string
  country: string
  linkedin: string
  website: string
  github: string
  // Display-only filename from onboarding or the Links sheet — file bytes are not stored.
  resumeFileName?: string
  education: Education[]
  experience: Experience[]
  skills: string[]
  applicationAccounts?: ApplicationAccount[]
  otherLinks?: OtherLink[]

  // Demographic Information — eeoAnswersEnabled is the master "answer these at all" switch;
  // when off, GoFillr skips EEO questions on real forms regardless of the values below.
  eeoAnswersEnabled?: boolean
  gender?: string
  raceEthnicity?: string
  disabilityStatus?: string
  veteranStatus?: string
  age18OrOlder?: string

  // Other Information
  desiredSalary?: string
  salaryNegotiable?: boolean
  workAuthorization?: string
  // Explicit override for the "do you need sponsorship" question — when unset, site rules
  // fall back to inferring it from workAuthorization.
  sponsorshipRequired?: string
  noticePeriod?: string

  // Workday
  accountEmail?: string
  accountPassword?: string
}

// An additional profile/portfolio link beyond the fixed LinkedIn/Portfolio/GitHub fields
// (Dribbble, Behance, X, or a custom "Other" link).
export interface OtherLink {
  id: number
  label: string
  url: string
}

export interface Education {
  id: number
  schoolName: string
  degreeType: string
  major: string
  startYear: string
  graduationYear: string
  gpa?: string
  current?: boolean
  locationCity?: string
  locationState?: string
}

export interface Experience {
  id: number
  companyName: string
  jobTitle: string
  startDate: string
  endDate?: string
  present?: boolean
  description: string
  locationCity?: string
  locationState?: string
}

// One login per portal (Workday, Greenhouse, iCIMS, ...) rather than a single global pair —
// candidates end up with a separate account per job portal.
export interface ApplicationAccount {
  id: number
  portal: string
  email: string
  password: string
  requireConfirmation: boolean
}

export interface Settings {
  autoFillEnabled: boolean
}

// One row in the fill-history/stats screen. Written by background.js (chrome.storage.local
// key "fillHistory"), pruned to the last 90 days on every write.
export interface FillHistoryEntry {
  id: number
  role: string
  site: string
  timestamp: number
  filledCount: number
  totalCount: number
}

// Shape returned by POST /resume/parse (see src/lib/api.ts for the request contract).
// Education/Experience entries have no `id` yet — the client assigns one on merge.
//
// fieldNotes is optional and backend-populated: a map of PersonalInfo key -> a short
// human-readable flag shown next to that field on the "confirm what we found" onboarding
// step (e.g. { location: "Low confidence — check" }). If the backend doesn't send a note
// for a field, the client defaults to "ok" when the value is non-empty and "Not found in
// resumé" when it's empty — never fabricate a confidence level the backend didn't report.
export type ParsedResumeData = Partial<Omit<PersonalInfo, 'education' | 'experience'>> & {
  education?: Omit<Education, 'id'>[]
  experience?: Omit<Experience, 'id'>[]
  fieldNotes?: Partial<Record<keyof PersonalInfo, string>>
}

export interface CustomResponse {
  id: number
  title: string
  text: string
  tags: string[]
}

export type NotificationType = 'success' | 'error'

export type SiteRule = {
  detect: () => boolean
  onMount?: (personalInfo: PersonalInfo) => void | (() => void)
  apply: (
    input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
    fieldText: string,
    personalInfo: PersonalInfo,
  ) => boolean | Promise<boolean>
  formChanged?: (mutations: MutationRecord[]) => boolean
}

export type FieldMatch = (
  input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  fieldText: string,
) => boolean
export type FieldHandler = (
  input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  fieldText: string,
  personalInfo: PersonalInfo,
  fieldLabel: string,
) => boolean | Promise<boolean>
