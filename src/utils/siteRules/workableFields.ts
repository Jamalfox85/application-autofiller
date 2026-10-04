// Pure mapping for Workable apply forms (apply.workable.com/{account}/j/{id}/apply
// and the EEO step, plus the same form embedded on a custom domain). Fields are
// identified by data-ui / name. Education and experience rows repeat those names,
// so the caller passes the editor index. DOM-free so the rules can be unit tested.
//
// v1 fills, in this order: contact, resume (recognized and left blank), experience,
// education, work authorization, then EEO. Custom / knockout questions are skipped.

import { monthNameFromLooseDate, yearFromLooseDate } from './greenhouseValues.ts'

export type WorkableGroup = 'application' | 'education' | 'experience' | 'eeo'

export type WorkableField = {
  dataUi?: string | null
  name?: string | null
  id?: string | null
  type?: string | null
  /** Question text for QA_ radios. Empty for standard inputs. */
  label?: string | null
  optionValue?: string | null
  optionLabel?: string | null
  group?: WorkableGroup | null
  /** aria-hidden address autocomplete piece (city, postcode, country). */
  hidden?: boolean | null
  placeholder?: string | null
}

export type WorkableProfile = {
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  addressLine2?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  country?: string | null
  resumeFileName?: string | null
  eeoAnswersEnabled?: boolean | null
  gender?: string | null
  raceEthnicity?: string | null
  disabilityStatus?: string | null
  veteranStatus?: string | null
  workAuthorization?: string | null
  sponsorshipRequired?: string | null
  education?: Array<{
    schoolName?: string | null
    degreeType?: string | null
    major?: string | null
    startYear?: string | null
    graduationYear?: string | null
    current?: boolean | null
  }> | null
  experience?: Array<{
    companyName?: string | null
    jobTitle?: string | null
    startDate?: string | null
    endDate?: string | null
    present?: boolean | null
    description?: string | null
  }> | null
}

export type WorkablePlan =
  | { action: 'text'; value: string }
  | { action: 'click' }
  /** Recognized, nothing to write. Caller must not let the generic matcher invent a value. */
  | { action: 'skip' }

export type WorkablePhase =
  | 'contact'
  | 'resume'
  | 'experience'
  | 'education'
  | 'work-authorization'
  | 'eeo'
  | 'custom'

export const WORKABLE_PHASES: WorkablePhase[] = [
  'contact',
  'resume',
  'experience',
  'education',
  'work-authorization',
  'eeo',
  'custom',
]

// Submit, Apply, Workable's own resume-import button, and the EEO submit/skip
// controls stay with the person. Adding an education or experience row is not a submit.
export function workableMaySubmit(): false {
  return false
}

const ADVANCE_DATA_UI = new Set([
  'apply-button',
  'submit-eeoc',
  'skip-eeoc',
  'skip-eeoc-footer',
  'autofill-button',
])

export function isWorkableAdvanceControl(control: {
  dataUi?: string | null
  type?: string | null
}): boolean {
  const ui = (control.dataUi || '').toLowerCase()
  const type = (control.type || '').toLowerCase()
  if (type === 'submit') return true
  return ADVANCE_DATA_UI.has(ui)
}

const AUTHORIZED_TO_WORK = new Set([
  'us_citizen',
  'green_card',
  'work_visa',
  'authorized_no_sponsorship',
])

const NO_SPONSORSHIP = new Set(['us_citizen', 'green_card', 'authorized_no_sponsorship'])

const COUNTRY_LABELS: Record<string, string> = {
  united_states: 'United States',
  us: 'United States',
  usa: 'United States',
  canada: 'Canada',
  united_kingdom: 'United Kingdom',
  uk: 'United Kingdom',
  great_britain: 'United Kingdom',
}

const MONTH_NUMBER: Record<string, string> = {
  january: '01',
  february: '02',
  march: '03',
  april: '04',
  may: '05',
  june: '06',
  july: '07',
  august: '08',
  september: '09',
  october: '10',
  november: '11',
  december: '12',
}

const RACE_VALUE: Record<string, string> = {
  hispanic_or_latino: 'hispanic_or_latino',
  white: 'white',
  black_or_african_american: 'black',
  native_hawaiian_or_other_pacific_islander: 'native_hawaiian',
  asian: 'asian',
  american_indian_or_alaska_native: 'american_indian',
  two_or_more_races: 'multiracial',
}

const GENDER_VALUE: Record<string, string> = {
  male: 'male',
  female: 'female',
}

const DISABILITY_VALUE: Record<string, string> = {
  yes: 'disabled',
  previously: 'disabled',
  no: 'not_disabled',
}

const VETERAN_VALUE: Record<string, string> = {
  veteran: 'veteran',
  not_a_veteran: 'not_veteran',
}

const CONTACT_RANK: Record<string, number> = {
  firstname: 0,
  lastname: 1,
  email: 2,
  phone: 3,
  address: 4,
}

const EXPERIENCE_RANK: Record<string, number> = {
  title: 0,
  company: 1,
  summary: 2,
  start_date: 3,
  end_date: 4,
  current: 5,
  industry: 6,
}

const EDUCATION_RANK: Record<string, number> = {
  school: 0,
  field_of_study: 1,
  degree: 2,
  start_date: 3,
  end_date: 4,
}

const HIDDEN_LOCATION_KEYS = new Set([
  'city',
  'postcode',
  'postal_code',
  'zip',
  'country',
  'state',
  'region',
  'subregion',
])

type WorkAuthKind = 'authorized-without-sponsorship' | 'authorized' | 'sponsorship' | 'basis'

// Short labels for a free-text "basis of your work authorization" question.
// These follow the profile statuses. They do not pick a visa class such as H-1B.
const WORK_AUTH_BASIS: Record<string, string> = {
  us_citizen: 'U.S. citizen',
  green_card: 'Permanent resident',
  authorized_no_sponsorship: 'Authorized, no sponsorship needed',
  work_visa: 'Authorized, sponsorship needed later',
  need_sponsorship: 'Need sponsorship now',
  not_authorized: 'Not authorized to work',
}

function clean(value: string | null | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim()
}

// Chunks are nearest-first. Fieldset text is often just "YES NO". The first
// ancestor that has the question wins; a later ancestor would include every
// question on the form and could mark a knockout as work authorization.
export function workableQuestionLabel(chunks: Array<string | null | undefined>): string {
  for (const chunk of chunks) {
    const text = clean(chunk)
    if (!text) continue
    if (/^(yes|no|yes no|no yes)$/i.test(text)) continue
    return text
  }
  return ''
}

export function workableFieldKey(field: WorkableField): string {
  const ui = (field.dataUi || '').toLowerCase()
  const name = (field.name || '').toLowerCase()
  const id = (field.id || '').toLowerCase()
  if (ui && ui !== 'option' && !ui.startsWith('qa_')) return ui
  if (name) return name
  if (id === 'input_phone') return 'phone'
  return id
}

export function workablePhase(field: WorkableField): WorkablePhase {
  const key = workableFieldKey(field)
  const type = (field.type || '').toLowerCase()
  if (field.group === 'eeo' || isEeoKey(key)) return 'eeo'
  if (field.group === 'experience') return 'experience'
  if (field.group === 'education') return 'education'
  if (type === 'file' && (key === 'resume' || key.includes('resume'))) return 'resume'
  if (isWorkAuthField(field)) return 'work-authorization'
  if (isCustomQuestion(field) || isOutOfScopeStandard(key, field.group)) return 'custom'
  if (
    key === 'firstname' ||
    key === 'lastname' ||
    key === 'email' ||
    key === 'phone' ||
    key === 'address' ||
    field.hidden
  ) {
    return 'contact'
  }
  return 'custom'
}

function isEeoKey(key: string): boolean {
  return key === 'gender' || key === 'race' || key === 'disability' || key === 'veteran'
}

function isCustomQuestion(field: WorkableField): boolean {
  const name = (field.name || '').toLowerCase()
  const ui = (field.dataUi || '').toLowerCase()
  return name.startsWith('qa_') || ui.startsWith('qa_')
}

function isOutOfScopeStandard(key: string, group: WorkableGroup | null | undefined): boolean {
  if (group === 'experience' && key === 'summary') return false
  return (
    key === 'summary' ||
    key === 'headline' ||
    key === 'cover_letter' ||
    key === 'avatar' ||
    key === 'industry'
  )
}

function isWorkAuthField(field: WorkableField): boolean {
  if (!isCustomQuestion(field)) return false
  return classifyWorkableQuestion(field.label) !== null
}

function isWorkAuthBasisQuestion(text: string): boolean {
  return (
    /basis of (?:your |the )?(?:current )?work authori[sz]ation/.test(text) ||
    /(?:what is|describe|state|provide|enter) (?:the |your )?(?:current )?(?:basis|type|status) of (?:your |the )?(?:current )?work authori[sz]ation/.test(
      text,
    ) ||
    /work authori[sz]ation (?:basis|type|status)/.test(text)
  )
}

export function classifyWorkableQuestion(text: string | null | undefined): WorkAuthKind | null {
  const t = clean(text).toLowerCase()
  if (!t) return null
  // "What is the basis of your current work authorization" contains "work
  // authorization" but it is not a yes/no. Classify it before the yes/no rules.
  if (isWorkAuthBasisQuestion(t)) return 'basis'
  // "eligibility to work" is the noun form of "eligible to work".
  const auth =
    /authori[sz]ed to work|work authori[sz]ation|legally authori[sz]ed|eligib(?:le|ility) to work|work eligibility|right to work/.test(
      t,
    )
  if (/years of|how many years|experience with|proficien/.test(t) && !auth) return null
  if (auth && /sponsor/.test(t)) {
    if (/without|w\/o|no sponsor|not require|do not require|don't require/.test(t)) {
      return 'authorized-without-sponsorship'
    }
    return 'sponsorship'
  }
  // "Will you require work authorization" asks whether they need it. That is
  // the sponsorship answer. "Authorized to work" and "eligibility to work"
  // stay authorized, and this check has to run before that generic rule.
  if (
    /require|need/.test(t) &&
    /work authori[sz]ation/.test(t) &&
    !/authori[sz]ed to work|eligib(?:le|ility) to work|work eligibility/.test(t)
  ) {
    return 'sponsorship'
  }
  if (auth) return 'authorized'
  if (/require|need/.test(t) && /sponsor/.test(t)) return 'sponsorship'
  return null
}

export function workableWorkAuthBasis(info: WorkableProfile): string | null {
  const status = clean(info.workAuthorization)
  if (!status) return null
  return WORK_AUTH_BASIS[status] || null
}

function hasWorkSignal(info: WorkableProfile): boolean {
  return Boolean(clean(info.workAuthorization) || clean(info.sponsorshipRequired))
}

function authorizedToWork(info: WorkableProfile): boolean {
  return AUTHORIZED_TO_WORK.has(clean(info.workAuthorization))
}

function requiresSponsorship(info: WorkableProfile): boolean {
  const explicit = clean(info.sponsorshipRequired)
  if (explicit) return explicit.toLowerCase() === 'yes'
  return !NO_SPONSORSHIP.has(clean(info.workAuthorization))
}

export function workableWorkAuthAnswer(
  kind: WorkAuthKind,
  info: WorkableProfile,
): 'yes' | 'no' | null {
  if (!hasWorkSignal(info)) return null
  if (kind === 'authorized') {
    if (!clean(info.workAuthorization)) return null
    return authorizedToWork(info) ? 'yes' : 'no'
  }
  if (kind === 'sponsorship') return requiresSponsorship(info) ? 'yes' : 'no'
  if (clean(info.workAuthorization) && !authorizedToWork(info)) return 'no'
  return requiresSponsorship(info) ? 'no' : 'yes'
}

export function workableMonthYear(value?: string | null): string | null {
  const year = yearFromLooseDate(value || '')
  if (!year) return null
  const monthName = monthNameFromLooseDate(value || '')
  const month = monthName ? MONTH_NUMBER[monthName.toLowerCase()] : '01'
  return `${month || '01'}/${year}`
}

export function workableAddressValue(info: WorkableProfile): string {
  const countryKey = clean(info.country).toLowerCase().replace(/[\s-]+/g, '_')
  const country = COUNTRY_LABELS[countryKey] || clean(info.country).replace(/_/g, ' ')
  const parts = [info.address, info.addressLine2, info.city, info.state, info.zip, country]
  const unique: string[] = []
  for (const part of parts) {
    const text = clean(part)
    if (!text) continue
    const key = text.toLowerCase()
    if (unique.some((existing) => existing.toLowerCase() === key)) continue
    unique.push(text)
  }
  return unique.join(', ')
}

function eeoEnabled(info: WorkableProfile): boolean {
  return info.eeoAnswersEnabled !== false
}

function eeoTarget(key: string, info: WorkableProfile): string | null {
  if (!eeoEnabled(info)) return null
  if (key === 'gender') return GENDER_VALUE[clean(info.gender)] || null
  if (key === 'race') return RACE_VALUE[clean(info.raceEthnicity)] || null
  if (key === 'disability') return DISABILITY_VALUE[clean(info.disabilityStatus)] || null
  if (key === 'veteran') return VETERAN_VALUE[clean(info.veteranStatus)] || null
  return null
}

function optionToken(field: WorkableField): string {
  return clean(field.optionValue || field.optionLabel).toLowerCase()
}

function isYesOption(field: WorkableField): boolean {
  const value = clean(field.optionValue).toLowerCase()
  const label = clean(field.optionLabel).toLowerCase()
  return value === 'true' || value === 'yes' || label === 'yes'
}

function isNoOption(field: WorkableField): boolean {
  const value = clean(field.optionValue).toLowerCase()
  const label = clean(field.optionLabel).toLowerCase()
  return value === 'false' || value === 'no' || label === 'no'
}

function textPlan(value: string | null | undefined): WorkablePlan {
  const text = clean(value)
  if (!text) return { action: 'skip' }
  return { action: 'text', value: text }
}

function clickYesNo(field: WorkableField, answer: 'yes' | 'no' | null): WorkablePlan {
  if (!answer) return { action: 'skip' }
  const type = (field.type || '').toLowerCase()
  if (type !== 'radio' && type !== 'checkbox') return { action: 'skip' }
  const selected = answer === 'yes' ? isYesOption(field) : isNoOption(field)
  return selected ? { action: 'click' } : { action: 'skip' }
}

export function workablePlan(field: WorkableField, info: WorkableProfile, rowIndex = 0): WorkablePlan {
  const type = (field.type || '').toLowerCase()
  if (type === 'submit' || type === 'button' || type === 'password' || type === 'hidden') {
    return { action: 'skip' }
  }
  if (isWorkableAdvanceControl({ dataUi: field.dataUi, type: field.type })) return { action: 'skip' }

  const key = workableFieldKey(field)
  const phase = workablePhase(field)

  if (phase === 'custom' || field.hidden || (field.group !== 'education' && field.group !== 'experience' && HIDDEN_LOCATION_KEYS.has(key) && key !== 'address')) {
    if (field.hidden || HIDDEN_LOCATION_KEYS.has(key)) return { action: 'skip' }
  }

  if (phase === 'resume' || type === 'file') return { action: 'skip' }
  if (phase === 'custom') return { action: 'skip' }

  if (phase === 'work-authorization') {
    const kind = classifyWorkableQuestion(field.label)
    if (!kind) return { action: 'skip' }
    if (kind === 'basis') {
      if (type === 'radio' || type === 'checkbox' || type === 'file' || type === 'select-one') {
        return { action: 'skip' }
      }
      return textPlan(workableWorkAuthBasis(info))
    }
    return clickYesNo(field, workableWorkAuthAnswer(kind, info))
  }

  if (phase === 'eeo' || field.group === 'eeo' || isEeoKey(key)) {
    const target = eeoTarget(key, info)
    if (!target) return { action: 'skip' }
    if (type !== 'radio' && type !== 'checkbox') return { action: 'skip' }
    return optionToken(field) === target ? { action: 'click' } : { action: 'skip' }
  }

  if (field.group === 'experience') {
    const row = info.experience?.[rowIndex]
    if (!row || rowIndex < 0) return { action: 'skip' }
    if (key === 'title') return textPlan(row.jobTitle)
    if (key === 'company') return textPlan(row.companyName)
    if (key === 'summary') return textPlan(row.description)
    if (key === 'start_date') return textPlan(workableMonthYear(row.startDate))
    if (key === 'end_date') {
      if (row.present) return { action: 'skip' }
      return textPlan(workableMonthYear(row.endDate))
    }
    if (key === 'current') {
      if (!row.present) return { action: 'skip' }
      return type === 'checkbox' || type === 'radio' ? { action: 'click' } : { action: 'skip' }
    }
    return { action: 'skip' }
  }

  if (field.group === 'education') {
    const row = info.education?.[rowIndex]
    if (!row || rowIndex < 0) return { action: 'skip' }
    if (key === 'school') return textPlan(row.schoolName)
    if (key === 'field_of_study') return textPlan(row.major)
    if (key === 'degree') return textPlan(row.degreeType)
    if (key === 'start_date') return textPlan(workableMonthYear(row.startYear))
    if (key === 'end_date') {
      if (row.current) return { action: 'skip' }
      return textPlan(workableMonthYear(row.graduationYear))
    }
    return { action: 'skip' }
  }

  if (key === 'firstname') return textPlan(info.firstName)
  if (key === 'lastname') return textPlan(info.lastName)
  if (key === 'email') return textPlan(info.email)
  if (key === 'phone') return textPlan(info.phone)
  if (key === 'address') return textPlan(workableAddressValue(info))

  return { action: 'skip' }
}

export function workableFieldRank(field: WorkableField): number {
  const key = workableFieldKey(field)
  const phase = workablePhase(field)
  if (phase === 'contact') return CONTACT_RANK[key] ?? 50
  if (phase === 'experience') return EXPERIENCE_RANK[key] ?? 50
  if (phase === 'education') return EDUCATION_RANK[key] ?? 50
  if (phase === 'eeo') {
    if (key === 'gender') return 0
    if (key === 'race') return 1
    if (key === 'veteran') return 2
    if (key === 'disability') return 3
  }
  return 0
}

export function compareWorkableFill(
  a: { field: WorkableField; row: number; order: number },
  b: { field: WorkableField; row: number; order: number },
): number {
  const phase = WORKABLE_PHASES.indexOf(workablePhase(a.field)) - WORKABLE_PHASES.indexOf(workablePhase(b.field))
  if (phase !== 0) return phase
  const aRow = a.row < 0 ? 999 : a.row
  const bRow = b.row < 0 ? 999 : b.row
  if (aRow !== bRow) return aRow - bRow
  const rank = workableFieldRank(a.field) - workableFieldRank(b.field)
  if (rank !== 0) return rank
  return a.order - b.order
}
