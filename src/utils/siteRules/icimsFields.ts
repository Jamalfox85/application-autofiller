import type { Education, Experience, PersonalInfo } from '../../types/index.ts'
import { bestOptionIndex } from '../optionMatch.ts'
import { RELATIVE_MATCHES } from '../relativeMatches.ts'
import { setReactInputValue } from '../inputHandlers.ts'
import {
  countrySearchValues,
  degreeSearchValues,
  isAuthorizedToWork,
  monthNameFromLooseDate,
  nativeSelectValue,
  nativeSponsorshipSelectValue,
  nativeWorkAuthorizationSelectValue,
  pickDegreeOption,
  profileRequiresSponsorship,
  yearFromLooseDate,
  type NativeSelectChoice,
} from './greenhouseValues.ts'
import {
  getIcimsAccount,
  hasIcimsAccountCredentials,
  isIcimsLoginSurface,
  type IcimsPageSignals,
} from './icimsAccount.ts'

// Shown once when the email gate (or a later login step) includes hCaptcha.
// GoFillr never solves, clicks, or types into the widget. The person finishes it.
export const ICIMS_HCAPTCHA_STOP_MESSAGE =
  'hCaptcha is on this iCIMS step. GoFillr does not solve or click it. Finish the challenge yourself. GoFillr will not submit the application.'

// Next, Log In, Create Account, and Submit stay with the person. The email gate
// often sits on hCaptcha, and application Submit is out of scope for every tenant.
export function icimsGateMayAdvance(): false {
  return false
}

export type IcimsControl = {
  tagName?: string | null
  type?: string | null
  name?: string | null
  id?: string | null
  placeholder?: string | null
  ariaLabel?: string | null
  autocomplete?: string | null
  fieldText?: string | null
}

export type IcimsOption = {
  value: string
  label: string
}

export type IcimsFieldKind =
  | 'unknown'
  | 'captcha'
  | 'euUkResident'
  | 'gateEmail'
  | 'gatePassword'
  | 'addressLine2'
  | 'custom'
  | 'resumeFile'
  | 'phoneType'
  | 'firstName'
  | 'lastName'
  | 'middleName'
  | 'email'
  | 'phone'
  | 'address'
  | 'city'
  | 'state'
  | 'zip'
  | 'country'
  | 'linkedin'
  | 'experienceTitle'
  | 'experienceCompany'
  | 'experienceStart'
  | 'experienceEnd'
  | 'experienceCurrent'
  | 'experienceDescription'
  | 'experienceLocation'
  | 'educationSchool'
  | 'educationDegree'
  | 'educationMajor'
  | 'educationStart'
  | 'educationEnd'
  | 'educationGpa'
  | 'workAuthorization'
  | 'sponsorship'
  | 'eeoGender'
  | 'eeoRace'
  | 'eeoVeteran'
  | 'eeoDisability'

export type IcimsLeaveReason =
  | 'captcha'
  | 'eu-uk'
  | 'address-line-2'
  | 'custom'
  | 'resume'
  | 'phone-type'
  | 'password-missing'
  | 'no-vault-value'
  | 'current-role'
  | 'eeo-off'
  | 'unowned-option'

export type IcimsSelectMode =
  | 'state'
  | 'country'
  | 'degree'
  | 'work-auth'
  | 'sponsorship'
  | 'gender'
  | 'race'
  | 'veteran'
  | 'disability'
  | 'month'
  | 'year'
  | 'school'
  | 'label'

export type IcimsFillPlan =
  | { field: IcimsFieldKind; action: 'ignore' }
  | { field: IcimsFieldKind; action: 'leave'; reason: IcimsLeaveReason }
  | { field: IcimsFieldKind; action: 'text'; value: string }
  | { field: IcimsFieldKind; action: 'check'; checked: true }
  | { field: IcimsFieldKind; action: 'select'; mode: IcimsSelectMode; query: string; text?: string }

type GateElement = {
  tagName?: string
  type?: string
  name?: string
  id?: string
  value?: string
  checked?: boolean
  placeholder?: string
  autocomplete?: string
  textContent?: string | null
  options?: ArrayLike<{ value?: string; text?: string; label?: string }>
  getAttribute?: (name: string) => string | null
  dispatchEvent?: (event: Event) => boolean
  focus?: () => void
  click?: () => void
}

export type IcimsGateFillResult = {
  wrote: Array<'email' | 'password'>
  hcaptcha: boolean
}

const HCAPTCHA_SELECTORS = [
  '.h-captcha',
  'iframe[src*="hcaptcha.com"]',
  'textarea[name="h-captcha-response"]',
  '[name="h-captcha-response"]',
  '[data-hcaptcha-widget-id]',
]

type QueryRoot = {
  querySelector?: (selector: string) => unknown
}

export function pageHasHcaptcha(doc: QueryRoot | null | undefined): boolean {
  if (!doc?.querySelector) return false
  for (const selector of HCAPTCHA_SELECTORS) {
    try {
      if (doc.querySelector(selector)) return true
    } catch {
      // Ignore a selector the host document cannot parse.
    }
  }
  return false
}

// No profile field is an EU/UK resident answer. Country of address is a different question.
export function icimsEuUkResidentAnswer(
  _personalInfo: Partial<PersonalInfo> | null | undefined,
): null {
  return null
}

export function icimsWritesGatePassword(
  personalInfo: Partial<PersonalInfo> | null | undefined,
): boolean {
  return hasIcimsAccountCredentials(personalInfo)
}

function compact(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function controlBlob(control: IcimsControl): string {
  return compact(
    [
      control.name,
      control.id,
      control.placeholder,
      control.ariaLabel,
      control.autocomplete,
      control.fieldText,
      control.type,
      control.tagName,
    ]
      .filter((part) => part != null && String(part).trim() !== '')
      .join(' '),
  )
}

function controlType(control: IcimsControl): string {
  return (control.type || '').toLowerCase()
}

function isPersonProfileField(blob: string): boolean {
  return blob.includes('personprofile')
}

function groupIndex(blob: string, group: 'experience' | 'education'): number | null {
  const match =
    group === 'experience'
      ? blob.match(/(?:workexperience|experience|employment|jobs)(\d+)/)
      : blob.match(/(?:education|school)(\d+)/)
  if (!match) return null
  return Number(match[1])
}

function isCustomField(blob: string): boolean {
  return (
    /rcf\d+/.test(blob) ||
    blob.includes('customquestion') ||
    blob.includes('howdidyouhear') ||
    blob.includes('personprofilefieldssource')
  )
}

function isCaptchaField(blob: string): boolean {
  return blob.includes('hcaptcha') || blob.includes('recaptcha') || blob.includes('captcharesponse')
}

function isEuUkResident(control: IcimsControl, blob: string): boolean {
  if (controlType(control) !== 'checkbox' && !blob.includes('checkbox')) return false
  const eu = blob.includes('eu') || blob.includes('europeanunion') || blob.includes('eea')
  const uk = blob.includes('uk') || blob.includes('unitedkingdom')
  return (eu || uk) && (blob.includes('resident') || blob.includes('residentof'))
}

function isAddressLine2(blob: string): boolean {
  if (blob.includes('addressstreet2') || blob.includes('addressline2') || blob.includes('apartment')) return true
  return /(?:address|street)2(?!\d)/.test(blob)
}

// "send" contains "end", so a bare includes("end") would treat a send-date as an end date.
function mentionsDateEnd(blob: string): boolean {
  return /(?:^|[^s])end(?:date|year|month|$)/.test(blob)
}

function isAddressLine1(blob: string): boolean {
  if (isAddressLine2(blob)) return false
  return (
    blob.includes('addressstreet1') ||
    blob.includes('addressline1') ||
    blob.includes('streetaddress') ||
    /(?:address|street)1(?!\d)/.test(blob)
  )
}

function blockedPersonName(blob: string): boolean {
  return blob.includes('emergency') || blob.includes('reference') || blob.includes('referral')
}

export function classifyIcimsControl(control: IcimsControl, loginSurface: boolean): IcimsFieldKind {
  const blob = controlBlob(control)
  const type = controlType(control)
  if (!blob) return 'unknown'
  if (isCaptchaField(blob)) return 'captcha'
  if (isEuUkResident(control, blob)) return 'euUkResident'
  if (type === 'password' || blob.includes('currentpassword') || blob.includes('newpassword')) {
    return 'gatePassword'
  }
  if (type === 'hidden' || type === 'submit' || type === 'button') return 'unknown'
  if (isCustomField(blob)) return 'custom'
  if (type === 'file' && (blob.includes('resume') || blob.includes('cv'))) return 'resumeFile'
  if (isAddressLine2(blob)) return 'addressLine2'
  if (blob.includes('phonetype') || blob.includes('phonedevicetype')) return 'phoneType'
  if (blob.includes('fax')) return 'unknown'

  if (!blockedPersonName(blob) && (blob.includes('firstname') || blob.includes('givenname'))) {
    return 'firstName'
  }
  if (
    !blockedPersonName(blob) &&
    (blob.includes('lastname') || blob.includes('surname') || blob.includes('familyname'))
  ) {
    return 'lastName'
  }
  if (!blockedPersonName(blob) && blob.includes('middlename')) return 'middleName'

  if (blob.includes('linkedin')) return 'linkedin'

  if (blob.includes('email')) {
    if (type === 'checkbox' || blob.includes('emailme') || blob.includes('emailopt')) return 'unknown'
    if (loginSurface && !isPersonProfileField(blob)) return 'gateEmail'
    return 'email'
  }

  if (
    (blob.includes('phone') || blob.includes('mobile') || blob.includes('telephone')) &&
    !blob.includes('headphone')
  ) {
    return 'phone'
  }

  if (isAddressLine1(blob)) return 'address'
  if (blob.includes('city') && !blob.includes('ethnicity') && !blob.includes('scarcity')) return 'city'
  if (
    (blob.includes('addressstate') || blob.includes('state') || blob.includes('province')) &&
    !blob.includes('statement') &&
    !blob.includes('estate') &&
    !blob.includes('unitedstates')
  ) {
    return 'state'
  }
  if (blob.includes('zip') || blob.includes('postal')) return 'zip'
  if (
    (blob.includes('addresscountry') || blob.includes('country')) &&
    !blob.includes('sponsor') &&
    !blob.includes('county')
  ) {
    return 'country'
  }
  if (
    blob.includes('address') &&
    !blob.includes('email') &&
    !blob.includes('city') &&
    !blob.includes('state') &&
    !blob.includes('zip') &&
    !blob.includes('postal') &&
    !blob.includes('country')
  ) {
    return 'address'
  }

  const experienceScoped =
    blob.includes('workexperience') || blob.includes('employment') || /jobs\d+/.test(blob)
  const educationScoped = blob.includes('education') || blob.includes('school') || blob.includes('university')

  // "Current employer" is the company name. Only a checkbox is the "I currently work here" control.
  if (
    (type === 'checkbox' || blob.includes('checkbox')) &&
    experienceScoped &&
    !blob.includes('employer') &&
    !blob.includes('company') &&
    (blob.includes('current') || blob.includes('iworkhere') || blob.includes('present'))
  ) {
    return 'experienceCurrent'
  }
  if (blob.includes('jobtitle') || blob.includes('positiontitle') || (experienceScoped && blob.includes('title'))) {
    return 'experienceTitle'
  }
  if (
    blob.includes('employer') ||
    blob.includes('companyname') ||
    (experienceScoped && blob.includes('company'))
  ) {
    return 'experienceCompany'
  }
  if (experienceScoped && (blob.includes('description') || blob.includes('responsibilit') || blob.includes('duties'))) {
    return 'experienceDescription'
  }
  if (experienceScoped && blob.includes('location')) return 'experienceLocation'
  if (experienceScoped && mentionsDateEnd(blob)) return 'experienceEnd'
  if (experienceScoped && (blob.includes('start') || blob.includes('fromdate'))) return 'experienceStart'

  if (educationScoped && (blob.includes('school') || blob.includes('university') || blob.includes('institution'))) {
    return 'educationSchool'
  }
  if (blob.includes('degree')) return 'educationDegree'
  if (blob.includes('fieldofstudy') || blob.includes('major') || blob.includes('discipline') || blob.includes('concentration')) {
    return 'educationMajor'
  }
  if (blob.includes('gpa') || blob.includes('gradepoint')) return 'educationGpa'
  if (educationScoped && (mentionsDateEnd(blob) || blob.includes('graduat'))) return 'educationEnd'
  if (educationScoped && blob.includes('start')) return 'educationStart'

  if (blob.includes('sponsor')) return 'sponsorship'
  if (
    blob.includes('workauthorization') ||
    blob.includes('authorizedtowork') ||
    blob.includes('legallyauthorized') ||
    blob.includes('workpermit') ||
    (blob.includes('authorized') && blob.includes('work'))
  ) {
    return 'workAuthorization'
  }

  if (blob.includes('gender') && !blob.includes('transgender')) return 'eeoGender'
  if (blob.includes('veteran') || blob.includes('military')) return 'eeoVeteran'
  if (blob.includes('disability') || blob.includes('disabled')) return 'eeoDisability'
  if (
    (blob.includes('race') || blob.includes('ethnicity') || blob.includes('hispanic')) &&
    !blob.includes('scarcity')
  ) {
    return 'eeoRace'
  }

  return 'unknown'
}

function textOrEmpty(field: IcimsFieldKind, value: string | undefined | null): IcimsFillPlan {
  const text = (value || '').trim()
  if (!text) return { field, action: 'ignore' }
  return { field, action: 'text', value: text }
}

function rowAt<T>(rows: T[] | undefined, index: number | null): T | undefined {
  if (!rows || rows.length === 0) return undefined
  return rows[index ?? 0]
}

function experienceRow(info: Partial<PersonalInfo> | null | undefined, blob: string): Experience | undefined {
  return rowAt(info?.experience, groupIndex(blob, 'experience'))
}

function educationRow(info: Partial<PersonalInfo> | null | undefined, blob: string): Education | undefined {
  return rowAt(info?.education, groupIndex(blob, 'education'))
}

function indexedRowMissing<T>(rows: T[] | undefined, index: number | null): boolean {
  if (index == null) return false
  return !rows || index >= rows.length || index < 0
}

function locationText(city?: string, state?: string): string {
  return [city, state]
    .map((part) => (part || '').trim())
    .filter(Boolean)
    .join(', ')
}

function emailForContact(info: Partial<PersonalInfo> | null | undefined): string {
  const profile = (info?.email || '').trim()
  if (profile) return profile
  return getIcimsAccount(info).email
}

function emailForGate(info: Partial<PersonalInfo> | null | undefined): string {
  const account = getIcimsAccount(info).email
  if (account) return account
  return (info?.email || '').trim()
}

function eeoBlocked(info: Partial<PersonalInfo> | null | undefined): boolean {
  return info?.eeoAnswersEnabled === false
}

function selectPlan(
  field: IcimsFieldKind,
  mode: IcimsSelectMode,
  query: string,
  text?: string,
): IcimsFillPlan {
  if (!query.trim() && !(text || '').trim()) return { field, action: 'ignore' }
  return { field, action: 'select', mode, query, text }
}

function hasExplicitWorkAuth(info: Partial<PersonalInfo> | null | undefined): boolean {
  return !!(info?.workAuthorization?.trim() || info?.sponsorshipRequired?.trim())
}

export function planIcimsFill(
  control: IcimsControl,
  personalInfo: Partial<PersonalInfo> | null | undefined,
  page: { loginSurface?: boolean } = {},
): IcimsFillPlan {
  const loginSurface = page.loginSurface === true
  const field = classifyIcimsControl(control, loginSurface)
  const blob = controlBlob(control)
  const type = controlType(control)

  if (field === 'unknown') return { field, action: 'ignore' }
  if (field === 'captcha') return { field, action: 'leave', reason: 'captcha' }
  if (field === 'euUkResident') return { field, action: 'leave', reason: 'eu-uk' }
  if (field === 'addressLine2') return { field, action: 'leave', reason: 'address-line-2' }
  if (field === 'custom') return { field, action: 'leave', reason: 'custom' }
  if (field === 'resumeFile') return { field, action: 'leave', reason: 'resume' }
  if (field === 'phoneType') return { field, action: 'leave', reason: 'phone-type' }

  if (field === 'gatePassword') {
    // requireConfirmation is stored on the account ("Ask before entering this password").
    // Workday account creation never reads that flag. icimsWritesGatePassword matches it:
    // a complete iCIMS row still supplies the password.
    if (!icimsWritesGatePassword(personalInfo)) {
      return { field, action: 'leave', reason: 'password-missing' }
    }
    return { field, action: 'text', value: getIcimsAccount(personalInfo).password }
  }

  if (field === 'gateEmail') return textOrEmpty(field, emailForGate(personalInfo))
  if (field === 'email') return textOrEmpty(field, emailForContact(personalInfo))
  if (field === 'firstName') return textOrEmpty(field, personalInfo?.firstName)
  if (field === 'lastName') return textOrEmpty(field, personalInfo?.lastName)
  if (field === 'middleName') return textOrEmpty(field, personalInfo?.middleName)
  if (field === 'phone') return textOrEmpty(field, personalInfo?.phone)
  if (field === 'address') return textOrEmpty(field, personalInfo?.address)
  if (field === 'linkedin') return textOrEmpty(field, personalInfo?.linkedin)
  if (field === 'city') return textOrEmpty(field, personalInfo?.city)
  if (field === 'zip') return textOrEmpty(field, personalInfo?.zip)

  if (field === 'state') {
    const raw = (personalInfo?.state || '').trim()
    if (!raw) return { field, action: 'ignore' }
    const text = raw.replace(/_/g, ' ')
    if (type === 'select' || (control.tagName || '').toLowerCase() === 'select') {
      return selectPlan(field, 'state', raw, text)
    }
    return { field, action: 'text', value: text }
  }

  if (field === 'country') {
    const raw = (personalInfo?.country || '').trim()
    if (!raw) return { field, action: 'ignore' }
    const text = countrySearchValues(raw)[0] || raw.replace(/_/g, ' ')
    if (type === 'select' || (control.tagName || '').toLowerCase() === 'select') {
      return selectPlan(field, 'country', raw, text)
    }
    return { field, action: 'text', value: text }
  }

  if (
    field === 'experienceTitle' ||
    field === 'experienceCompany' ||
    field === 'experienceStart' ||
    field === 'experienceEnd' ||
    field === 'experienceCurrent' ||
    field === 'experienceDescription' ||
    field === 'experienceLocation'
  ) {
    const index = groupIndex(blob, 'experience')
    if (indexedRowMissing(personalInfo?.experience, index)) {
      return { field, action: 'leave', reason: 'no-vault-value' }
    }
    const row = experienceRow(personalInfo, blob)
    if (!row) return { field, action: 'ignore' }
    if (field === 'experienceCurrent') {
      if (type === 'checkbox' && row.present) return { field, action: 'check', checked: true }
      return { field, action: 'leave', reason: 'no-vault-value' }
    }
    if (field === 'experienceEnd' && row.present) return { field, action: 'leave', reason: 'current-role' }
    if (field === 'experienceTitle') return textOrEmpty(field, row.jobTitle)
    if (field === 'experienceCompany') return textOrEmpty(field, row.companyName)
    if (field === 'experienceDescription') return textOrEmpty(field, row.description)
    if (field === 'experienceLocation') return textOrEmpty(field, locationText(row.locationCity, row.locationState))
    return datePlan(field, blob, type, control, field === 'experienceStart' ? row.startDate : row.endDate)
  }

  if (
    field === 'educationSchool' ||
    field === 'educationDegree' ||
    field === 'educationMajor' ||
    field === 'educationStart' ||
    field === 'educationEnd' ||
    field === 'educationGpa'
  ) {
    const index = groupIndex(blob, 'education')
    if (indexedRowMissing(personalInfo?.education, index)) {
      return { field, action: 'leave', reason: 'no-vault-value' }
    }
    const row = educationRow(personalInfo, blob)
    if (!row) return { field, action: 'ignore' }
    if (field === 'educationSchool') {
      return catalogOrText(field, 'school', row.schoolName, type, control)
    }
    if (field === 'educationDegree') {
      return catalogOrText(field, 'degree', row.degreeType, type, control)
    }
    if (field === 'educationMajor') return textOrEmpty(field, row.major)
    if (field === 'educationGpa') return textOrEmpty(field, row.gpa)
    const when = field === 'educationStart' ? row.startYear : row.graduationYear
    return datePlan(field, blob, type, control, when)
  }

  if (field === 'workAuthorization' || field === 'sponsorship') {
    // Claiming the field blocks the generic matcher, which would type the question
    // text itself into a work-authorization control.
    if (!hasExplicitWorkAuth(personalInfo)) return { field, action: 'leave', reason: 'no-vault-value' }
    if (field === 'sponsorship') {
      const answer = profileRequiresSponsorship({
        workAuthorization: personalInfo?.workAuthorization,
        sponsorshipRequired: personalInfo?.sponsorshipRequired,
      })
      if (type === 'checkbox') {
        return answer ? { field, action: 'check', checked: true } : { field, action: 'leave', reason: 'no-vault-value' }
      }
      if (type === 'radio') return radioPlan(field, 'sponsorship', answer ? 'yes' : 'no', control)
      return selectPlan(field, 'sponsorship', answer ? 'yes' : 'no')
    }
    const status = personalInfo?.workAuthorization || ''
    if (!status) return { field, action: 'leave', reason: 'no-vault-value' }
    if (type === 'checkbox') {
      return isAuthorizedToWork(status)
        ? { field, action: 'check', checked: true }
        : { field, action: 'leave', reason: 'no-vault-value' }
    }
    if (type === 'radio') return radioPlan(field, 'work-auth', status, control)
    return selectPlan(field, 'work-auth', status)
  }

  if (field === 'eeoGender' || field === 'eeoRace' || field === 'eeoVeteran' || field === 'eeoDisability') {
    if (eeoBlocked(personalInfo)) return { field, action: 'leave', reason: 'eeo-off' }
    const mode: IcimsSelectMode =
      field === 'eeoGender' ? 'gender' : field === 'eeoRace' ? 'race' : field === 'eeoVeteran' ? 'veteran' : 'disability'
    const query =
      field === 'eeoGender'
        ? personalInfo?.gender || ''
        : field === 'eeoRace'
          ? personalInfo?.raceEthnicity || ''
          : field === 'eeoVeteran'
            ? personalInfo?.veteranStatus || ''
            : personalInfo?.disabilityStatus || ''
    if (!query.trim()) return { field, action: 'ignore' }
    if (type === 'radio') return radioPlan(field, mode, query, control)
    return selectPlan(field, mode, query)
  }

  return { field, action: 'ignore' }
}

function catalogOrText(
  field: IcimsFieldKind,
  mode: 'school' | 'degree',
  value: string | undefined,
  type: string,
  control: IcimsControl,
): IcimsFillPlan {
  const text = (value || '').trim()
  if (!text) return { field, action: 'ignore' }
  if (type === 'select' || (control.tagName || '').toLowerCase() === 'select') {
    return selectPlan(field, mode, text, text)
  }
  return { field, action: 'text', value: text }
}

function datePlan(
  field: IcimsFieldKind,
  blob: string,
  type: string,
  control: IcimsControl,
  value: string | undefined,
): IcimsFillPlan {
  const raw = (value || '').trim()
  if (!raw) return { field, action: 'ignore' }
  const select = type === 'select' || (control.tagName || '').toLowerCase() === 'select'
  if (select && blob.includes('month')) {
    const month = monthNameFromLooseDate(raw)
    if (!month) return { field, action: 'ignore' }
    return selectPlan(field, 'month', month, month)
  }
  if (select && blob.includes('year')) {
    const year = yearFromLooseDate(raw) || (/^\d{4}$/.test(raw) ? raw : '')
    if (!year) return { field, action: 'ignore' }
    return selectPlan(field, 'year', year, year)
  }
  return { field, action: 'text', value: raw }
}

function optionLabel(control: IcimsControl): string {
  return [control.ariaLabel, control.fieldText, control.name, control.id].filter(Boolean).join(' ')
}

function radioPlan(
  field: IcimsFieldKind,
  mode: IcimsSelectMode,
  query: string,
  control: IcimsControl,
): IcimsFillPlan {
  const label = optionLabel(control)
  const chosen = resolveIcimsSelect({ field, action: 'select', mode, query }, [{ value: label, label }])
  if (!chosen) return { field, action: 'leave', reason: 'unowned-option' }
  return { field, action: 'check', checked: true }
}

function aliasLabel(labels: string[], desired: string, kind: 'state' | 'country'): string | null {
  const want = desired.trim().toLowerCase().replace(/_/g, ' ')
  if (!want) return null
  const exact = labels.find((label) => label.trim().toLowerCase() === want)
  if (exact) return exact
  const group = RELATIVE_MATCHES[kind].find((aliases) => aliases.some((alias) => alias.toLowerCase() === want))
  if (!group) return null
  const hits = labels.filter((label) => group.some((alias) => alias.toLowerCase() === label.trim().toLowerCase()))
  if (hits.length > 0) {
    hits.sort((a, b) => b.trim().length - a.trim().length)
    return hits[0]
  }
  const loose = labels.filter((label) => {
    const normalized = label.trim().toLowerCase()
    return group.some((alias) => alias.length > 2 && normalized.includes(alias.toLowerCase()))
  })
  if (loose.length === 0) return null
  loose.sort((a, b) => a.length - b.length)
  return loose[0]
}

function pickSchoolLabel(labels: string[], school: string): string | null {
  const want = school.trim().toLowerCase()
  if (!want) return null
  const exact = labels.find((label) => label.trim().toLowerCase() === want)
  if (exact) return exact
  const contained = labels.filter((label) => label.trim().toLowerCase().includes(want))
  if (contained.length === 1) return contained[0]
  if (contained.length > 1) {
    contained.sort((a, b) => a.length - b.length)
    return contained[0]
  }
  return null
}

function genderLabel(labels: string[], gender: string): string | null {
  const groups: Record<string, string[]> = {
    male: ['Male', 'Man'],
    female: ['Female', 'Woman'],
    non_binary: ['Non-binary', 'Nonbinary', 'Genderqueer'],
    self_describe: ['Prefer to self-describe', 'Self-describe', 'Self Describe'],
  }
  const queries = groups[gender]
  if (!queries) return null
  const cleaned = labels.map((label) => ({ raw: label, n: label.toLowerCase().replace(/\s+/g, ' ').trim() }))
  for (const query of queries) {
    const exact = cleaned.find((label) => label.n === query.toLowerCase())
    if (exact) return exact.raw
  }
  for (const query of queries) {
    const want = query.toLowerCase()
    const hit = cleaned.find((label) => {
      if (want === 'male' && label.n.includes('female')) return false
      if (want === 'man' && (label.n.includes('woman') || label.n.includes('human'))) return false
      return label.n.includes(want)
    })
    if (hit) return hit.raw
  }
  return null
}

function needleLabel(labels: string[], groups: string[][]): string | null {
  const cleaned = labels
    .map((label) => ({ raw: label, n: label.toLowerCase().replace(/\s+/g, ' ').trim() }))
    .filter((label) => label.n && !label.n.startsWith('select'))
  for (const group of groups) {
    for (const needle of group) {
      const exact = cleaned.find((label) => label.n === needle.toLowerCase())
      if (exact) return exact.raw
    }
  }
  for (const group of groups) {
    for (const needle of group) {
      const want = needle.toLowerCase()
      if (want.length < 4) continue
      const hit = cleaned.find((label) => label.n.includes(want))
      if (hit) return hit.raw
    }
  }
  return null
}

function raceLabel(labels: string[], race: string): string | null {
  const groups: Record<string, string[][]> = {
    hispanic_or_latino: [['Hispanic or Latino', 'Hispanic']],
    white: [['White']],
    black_or_african_american: [['Black or African American', 'Black']],
    asian: [['Asian']],
    american_indian_or_alaska_native: [['American Indian or Alaska Native', 'American Indian']],
    native_hawaiian_or_other_pacific_islander: [['Native Hawaiian', 'Pacific Islander']],
    two_or_more_races: [['Two or More Races', 'Two or more']],
  }
  return needleLabel(labels, groups[race] || [])
}

function veteranLabel(labels: string[], status: string): string | null {
  const groups: Record<string, string[][]> = {
    veteran: [['I am a veteran', 'Protected veteran', 'Yes']],
    not_a_veteran: [['I am not a veteran', 'I am not a protected veteran', 'No']],
  }
  return needleLabel(labels, groups[status] || [])
}

function disabilityLabel(labels: string[], status: string): string | null {
  const groups: Record<string, string[][]> = {
    yes: [['Yes, I have a disability', 'Yes']],
    no: [['No, I do not have a disability', 'No']],
    previously: [['Yes, I have a disability, or have had one in the past', 'previously']],
  }
  return needleLabel(labels, groups[status] || [])
}

export function resolveIcimsSelect(
  plan: Extract<IcimsFillPlan, { action: 'select' }>,
  options: IcimsOption[],
): string | null {
  const choices: NativeSelectChoice[] = options.map((option) => ({
    value: option.value,
    label: option.label,
  }))
  const labels = choices.map((choice) => choice.label)
  let label: string | null = null
  if (plan.mode === 'state') label = aliasLabel(labels, plan.query, 'state')
  else if (plan.mode === 'country') label = aliasLabel(labels, plan.query, 'country') || aliasLabel(labels, plan.text || '', 'country')
  else if (plan.mode === 'degree') label = pickDegreeOption(labels, degreeSearchValues(plan.query))
  else if (plan.mode === 'school') label = pickSchoolLabel(labels, plan.query)
  else if (plan.mode === 'month' || plan.mode === 'year' || plan.mode === 'label') {
    const index = bestOptionIndex(labels, plan.query)
    label = index >= 0 ? labels[index] : null
  } else if (plan.mode === 'work-auth') {
    return nativeWorkAuthorizationSelectValue(choices, plan.query)
  } else if (plan.mode === 'sponsorship') {
    return nativeSponsorshipSelectValue(choices, plan.query === 'yes')
  } else if (plan.mode === 'gender') label = genderLabel(labels, plan.query)
  else if (plan.mode === 'race') label = raceLabel(labels, plan.query)
  else if (plan.mode === 'veteran') label = veteranLabel(labels, plan.query)
  else if (plan.mode === 'disability') label = disabilityLabel(labels, plan.query)

  if (!label) return null
  return nativeSelectValue(choices, () => label)
}

type Writable = GateElement & { value?: string; checked?: boolean }

function assignText(input: Writable, value: string) {
  if (typeof HTMLInputElement !== 'undefined' && input instanceof HTMLInputElement) {
    setReactInputValue(input, value)
    input.dispatchEvent?.(new Event('change', { bubbles: true }))
    return
  }
  if (typeof HTMLTextAreaElement !== 'undefined' && input instanceof HTMLTextAreaElement) {
    setReactInputValue(input, value)
    input.dispatchEvent?.(new Event('change', { bubbles: true }))
    return
  }
  input.value = value
}

function assignSelect(input: Writable, value: string) {
  input.value = value
  try {
    input.dispatchEvent?.(new Event('input', { bubbles: true }))
    input.dispatchEvent?.(new Event('change', { bubbles: true }))
  } catch {
    // Fake controls used in tests have no event target.
  }
}

export function readIcimsOptions(input: {
  options?: ArrayLike<{ value?: string; text?: string; label?: string }>
}): IcimsOption[] {
  const options = input.options
  if (!options || typeof options.length !== 'number') return []
  const result: IcimsOption[] = []
  for (let i = 0; i < options.length; i++) {
    const option = options[i]
    if (!option) continue
    const label = String(option.text || option.label || '')
      .replace(/\s+/g, ' ')
      .trim()
    const value = option.value ?? ''
    if (!label && !value) continue
    result.push({ value: String(value), label: label || String(value) })
  }
  return result
}

export function applyIcimsPlan(input: Writable, plan: IcimsFillPlan): boolean {
  if (plan.action === 'ignore') return false
  if (plan.action === 'leave') return true
  if (plan.action === 'check') {
    if (input.checked === true) return true
    input.checked = true
    try {
      input.dispatchEvent?.(new Event('change', { bubbles: true }))
    } catch {
      // Ignore.
    }
    return true
  }
  if (plan.action === 'text') {
    if (!plan.value) return true
    if ((input.value || '') === plan.value) return true
    assignText(input, plan.value)
    return true
  }
  const options = readIcimsOptions(input)
  if (options.length === 0) {
    if (plan.text) {
      assignText(input, plan.text)
      return true
    }
    return true
  }
  const value = resolveIcimsSelect(plan, options)
  if (!value) return true
  if ((input.value || '') === value) return true
  assignSelect(input, value)
  return true
}

function elementAttr(element: GateElement, name: string): string {
  if (typeof element.getAttribute === 'function') {
    const value = element.getAttribute(name)
    if (value != null && value !== '') return String(value)
  }
  if (name === 'aria-label') return ''
  const direct = (element as Record<string, unknown>)[name]
  return direct == null ? '' : String(direct)
}

export function controlFromElement(element: GateElement, fieldText = ''): IcimsControl {
  const tag = (element.tagName || (element.options ? 'SELECT' : 'INPUT')).toString()
  return {
    tagName: tag,
    type: elementAttr(element, 'type') || element.type || '',
    name: elementAttr(element, 'name') || element.name || '',
    id: elementAttr(element, 'id') || element.id || '',
    placeholder: elementAttr(element, 'placeholder') || element.placeholder || '',
    ariaLabel: elementAttr(element, 'aria-label'),
    autocomplete: elementAttr(element, 'autocomplete') || element.autocomplete || '',
    fieldText,
  }
}

let gateGeneration = 0
const gateStamps = new WeakMap<object, number>()
let captchaAnnounced = false

export function resetIcimsGateFillState() {
  gateGeneration += 1
  captchaAnnounced = false
}

export function consumeIcimsHcaptchaStop(doc: QueryRoot | null | undefined): boolean {
  if (!pageHasHcaptcha(doc)) return false
  if (captchaAnnounced) return false
  captchaAnnounced = true
  console.info(ICIMS_HCAPTCHA_STOP_MESSAGE)
  return true
}

type GateDocument = {
  querySelector?: (selector: string) => unknown
  querySelectorAll?: (selector: string) => ArrayLike<GateElement>
}

// Fills email and password on the login / email-first gate. Does not click Next,
// Log In, Create Account, or Submit, and does not type into hCaptcha or the EU/UK box.
export function fillIcimsLoginGate(
  doc: GateDocument | null | undefined,
  personalInfo: Partial<PersonalInfo> | null | undefined,
  page: IcimsPageSignals,
): IcimsGateFillResult {
  const result: IcimsGateFillResult = { wrote: [], hcaptcha: pageHasHcaptcha(doc) }
  if (!isIcimsLoginSurface(page) || !hasIcimsAccountCredentials(personalInfo)) return result
  if (!doc?.querySelectorAll) return result

  const nodes = doc.querySelectorAll('input, textarea, select, button')
  for (let i = 0; i < nodes.length; i++) {
    const element = nodes[i]
    if (!element) continue
    const plan = planIcimsFill(controlFromElement(element), personalInfo, { loginSurface: true })
    if (plan.action !== 'text') continue
    if (plan.field !== 'gateEmail' && plan.field !== 'gatePassword') continue
    if ((element.value || '') === plan.value) continue
    const stamped = gateStamps.get(element) === gateGeneration
    if (stamped && (element.value || '').trim() !== '') continue
    const before = element.value
    applyIcimsPlan(element, plan)
    if (element.value && element.value !== before) {
      gateStamps.set(element, gateGeneration)
      result.wrote.push(plan.field === 'gateEmail' ? 'email' : 'password')
    }
  }
  return result
}

export function icimsFormSignature(doc: GateDocument | null | undefined): string {
  if (!doc?.querySelectorAll) return ''
  const nodes = doc.querySelectorAll('input, textarea, select')
  const parts: string[] = []
  for (let i = 0; i < nodes.length; i++) {
    const element = nodes[i]
    if (!element) continue
    const type = (elementAttr(element, 'type') || element.type || '').toLowerCase()
    if (type === 'hidden') continue
    const name = elementAttr(element, 'name') || element.name || ''
    const id = elementAttr(element, 'id') || element.id || ''
    parts.push(`${type}:${name}:${id}`)
  }
  return parts.join('|')
}
