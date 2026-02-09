export interface PersonalInfo {
  firstName: string
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
  graduationYear: string
  gpa?: string
}

export interface SavedResponse {
  id: number
  title: string
  text: string
  tags: string[]
  createdAt: string
}

export type NotificationType = 'success' | 'error'
