export interface PersonalInfo {
  firstName: string
  middleName?: string
  lastName: string
  email: string
  phone: string
  address: string
  city: string
  state: string
  zip: string
  country: string
  linkedin?: string
  website: string
  github?: string
  resumeFile?: string
  education: Education[]
  experience: Experience[]
  skills?: string[]

  // Demographic Information
  gender?: string
  raceEthnicity?: string
  disabilityStatus?: string
  veteranStatus?: string
  age18OrOlder?: string

  // Other Information
  desiredSalary?: number
  workAuthorization?: string

  // Workday
  accountPassword?: string
}

export interface Education {
  id: number
  schoolName: string
  degreeType: string
  major: string
  startYear: string
  graduationYear: string
  gpa?: string
}

export interface Experience {
  id: number
  companyName: string
  jobTitle: string
  startDate: string
  endDate?: string
  present?: boolean
  description: string
}

export interface SavedResponse {
  id: number
  title: string
  text: string
  tags: string[]
  createdAt: string
}

export type NotificationType = 'success' | 'error'

export type SiteRule = {
  detect: () => boolean
  onMount?: (personalInfo: PersonalInfo) => void | (() => void) // Optional function that runs when the site is detected. Can return a cleanup function if needed.
  apply: (
    input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
    fieldText: string,
    personalInfo: PersonalInfo,
  ) => boolean | Promise<boolean>
  formChanged?: (mutations: MutationRecord[]) => boolean
}

export type FieldMatch = (
  fieldText: string,
  input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
) => boolean
export type FieldHandler = (
  input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  fieldText: string,
  personalInfo: PersonalInfo,
  fieldLabel: string,
) => boolean | Promise<boolean>
