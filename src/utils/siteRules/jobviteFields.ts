// Pure mapping for hosted Jobvite apply forms (jobs.jobvite.com/{company}/job/{id}/apply
// and the older /careers/{company}/job/{id}/apply path). Questions are identified by the
// visible label, autocomplete token, and option text — field ids are opaque (jv-field-…).
// DOM-free so the rules can be unit tested against the labels those pages render.
//
// v1 fills contact, resume (left for the user), experience, education, work
// authorization, and EEO. Custom screening questions are skipped.

export type JobviteSection = 'apply' | 'eeo' | 'ofccp' | 'prescreen'

export type JobviteOption = {
  text?: string | null
  value?: string | null
}

export type JobviteField = {
  label?: string | null
  /** Radio or checkbox answer text. Empty for text inputs and selects. */
  optionLabel?: string | null
  type?: string | null
  autocomplete?: string | null
  section?: JobviteSection | null
  options?: JobviteOption[] | null
}

export type JobviteProfile = {
  firstName?: string | null
  middleName?: string | null
  lastName?: string | null
  email?: string | null
  phone?: string | null
  phoneCountryCode?: string | null
  address?: string | null
  addressLine2?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  country?: string | null
  linkedin?: string | null
  website?: string | null
  github?: string | null
  eeoAnswersEnabled?: boolean | null
  gender?: string | null
  raceEthnicity?: string | null
  disabilityStatus?: string | null
  veteranStatus?: string | null
  age18OrOlder?: string | null
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

export type JobvitePlan =
  | { action: 'text'; value: string }
  | { action: 'select'; optionText: string }
  | { action: 'click' }
  /** Recognized, nothing to write. Caller must not let the generic matcher invent a value. */
  | { action: 'skip' }

export type JobviteRepeatKey =
  | 'company'
  | 'title'
  | 'expStart'
  | 'expEnd'
  | 'expDescription'
  | 'school'
  | 'degree'
  | 'major'
  | 'eduStart'
  | 'eduEnd'
  | 'city'
  | 'state'
  | 'postal'
  | 'country'
  | 'address'

export type JobviteEeoKind = 'gender' | 'race' | 'veteran' | 'disability'

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

const US_STATE_NAMES: Record<string, string> = {
  al: 'Alabama',
  ak: 'Alaska',
  az: 'Arizona',
  ar: 'Arkansas',
  ca: 'California',
  co: 'Colorado',
  ct: 'Connecticut',
  de: 'Delaware',
  dc: 'District of Columbia',
  fl: 'Florida',
  ga: 'Georgia',
  hi: 'Hawaii',
  id: 'Idaho',
  il: 'Illinois',
  in: 'Indiana',
  ia: 'Iowa',
  ks: 'Kansas',
  ky: 'Kentucky',
  la: 'Louisiana',
  me: 'Maine',
  md: 'Maryland',
  ma: 'Massachusetts',
  mi: 'Michigan',
  mn: 'Minnesota',
  ms: 'Mississippi',
  mo: 'Missouri',
  mt: 'Montana',
  ne: 'Nebraska',
  nv: 'Nevada',
  nh: 'New Hampshire',
  nj: 'New Jersey',
  nm: 'New Mexico',
  ny: 'New York',
  nc: 'North Carolina',
  nd: 'North Dakota',
  oh: 'Ohio',
  ok: 'Oklahoma',
  or: 'Oregon',
  pa: 'Pennsylvania',
  ri: 'Rhode Island',
  sc: 'South Carolina',
  sd: 'South Dakota',
  tn: 'Tennessee',
  tx: 'Texas',
  ut: 'Utah',
  vt: 'Vermont',
  va: 'Virginia',
  wa: 'Washington',
  wv: 'West Virginia',
  wi: 'Wisconsin',
  wy: 'Wyoming',
}

const SINGLE_CONTACT = new Set<JobviteRepeatKey>(['city', 'state', 'postal', 'country', 'address'])

export function normalizeJobviteLabel(value: string | null | undefined): string {
  return (value || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function clean(value: string | null | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim()
}

function fieldType(field: JobviteField): string {
  return (field.type || '').toLowerCase()
}

function labelOf(field: JobviteField): string {
  return normalizeJobviteLabel(field.label)
}

function autoOf(field: JobviteField): string {
  const token = (field.autocomplete || '').toLowerCase().trim()
  if (!token || token === 'on' || token === 'off') return ''
  return token
}

function eeoEnabled(info: JobviteProfile): boolean {
  return info.eeoAnswersEnabled !== false
}

export function jobviteFullName(info: JobviteProfile): string {
  return [info.firstName, info.middleName, info.lastName]
    .map((part) => clean(part))
    .filter(Boolean)
    .join(' ')
}

export function jobvitePhoneValue(info: JobviteProfile): string {
  const phone = clean(info.phone)
  if (!phone) return ''
  if (phone.startsWith('+')) return phone
  const code = clean(info.phoneCountryCode)
  if (!code) return phone
  if (phone.startsWith(code)) return phone
  return `${code} ${phone}`.trim()
}

export function jobviteCountryLabel(country?: string | null): string {
  const raw = clean(country)
  if (!raw) return ''
  const key = raw.toLowerCase().replace(/[\s-]+/g, '_')
  return COUNTRY_LABELS[key] || raw.replace(/_/g, ' ')
}

function stateNames(state?: string | null): string[] {
  const raw = clean(state).replace(/_/g, ' ')
  if (!raw) return []
  const lower = raw.toLowerCase()
  const names = [raw]
  if (lower.length === 2 && US_STATE_NAMES[lower]) names.push(US_STATE_NAMES[lower])
  const abbrev = Object.entries(US_STATE_NAMES).find(([, name]) => name.toLowerCase() === lower)?.[0]
  if (abbrev) names.push(abbrev.toUpperCase())
  return names
}

function optionRows(field: JobviteField): Array<{ text: string; value: string; norm: string }> {
  return (field.options || [])
    .map((option) => {
      const text = clean(option.text)
      const value = clean(option.value)
      return { text, value, norm: normalizeJobviteLabel(text || value) }
    })
    .filter((option) => option.norm && option.norm !== 'selectanoption')
}

export function pickJobviteOption(field: JobviteField, queries: string[]): string | null {
  const rows = optionRows(field)
  if (rows.length === 0) return null

  for (const query of queries) {
    const q = clean(query).toLowerCase()
    const qNorm = normalizeJobviteLabel(query)
    if (!q || !qNorm) continue
    const exact = rows.find(
      (row) => row.text.toLowerCase() === q || row.value.toLowerCase() === q || row.norm === qNorm,
    )
    if (exact) return exact.text || exact.value
  }

  for (const query of queries) {
    const qNorm = normalizeJobviteLabel(query)
    if (qNorm.length < 4) continue
    const hits = rows.filter((row) => row.norm.includes(qNorm))
    if (hits.length === 0) continue
    hits.sort((a, b) => a.norm.length - b.norm.length)
    return hits[0].text || hits[0].value
  }

  return null
}

function hasPhrase(label: string, phrase: string): boolean {
  const hay = label.toLowerCase()
  const needle = phrase.toLowerCase()
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|[^a-z])${escaped}(?:[^a-z]|$)`).test(hay)
}

function isDeclineLabel(label: string): boolean {
  const norm = normalizeJobviteLabel(label)
  return (
    norm.includes('decline') ||
    norm.includes('prefernot') ||
    norm.includes('donotwish') ||
    norm.includes('dontwish') ||
    norm.includes('donotwant') ||
    norm.includes('rathernot') ||
    (norm.includes('selfidentification') && norm.includes('decline'))
  )
}

function blob(field: JobviteField): string {
  return [field.label, field.optionLabel, ...(field.options || []).map((option) => option.text)]
    .map((part) => clean(part))
    .filter(Boolean)
    .join(' ')
}

function isOutOfScope(norm: string): boolean {
  if (!norm) return false
  return (
    norm.includes('howdidyouhear') ||
    norm.includes('howdidyoulearn') ||
    norm.includes('heardabout') ||
    norm.includes('referral') ||
    norm.includes('referredby') ||
    norm.includes('coverletter') ||
    norm.includes('sms') ||
    norm.includes('textmessage') ||
    norm.includes('noncompete') ||
    norm.includes('nonsolicit') ||
    norm.includes('previouslyworked') ||
    norm.includes('haveyouworked') ||
    norm.includes('workedfor') ||
    norm.includes('workedat') ||
    norm.includes('salary') ||
    norm.includes('compensation') ||
    norm.includes('desiredpay') ||
    norm.includes('wage') ||
    norm.includes('captcha') ||
    norm.includes('recaptcha') ||
    norm.includes('county') ||
    norm.includes('noticeperiod') ||
    norm.includes('whenleaving') ||
    norm.includes('whendidyouleave') ||
    norm.includes('restrictyoufromworking')
  )
}

function isResume(field: JobviteField, norm: string): boolean {
  const type = fieldType(field)
  if (type === 'file') return true
  return norm === 'resume' || norm === 'cv' || norm === 'curriculumvitae' || norm.includes('addresume')
}

function isPhoneLabel(norm: string): boolean {
  if (!norm || norm.includes('microphone') || norm.includes('headphone')) return false
  return (
    norm === 'phone' ||
    norm === 'mobile' ||
    norm === 'telephone' ||
    norm.includes('phonenumber') ||
    norm.includes('mobilephone') ||
    norm.includes('homephone') ||
    norm.includes('workphone') ||
    norm.includes('cellphone')
  )
}

function isStateLabel(norm: string): boolean {
  if (!norm || norm.includes('statement') || norm.includes('estate') || norm.includes('unitedstates')) {
    return false
  }
  if (norm.includes('workstatus') || norm.includes('status')) return false
  return (
    norm === 'state' ||
    norm === 'province' ||
    norm.includes('stateprovince') ||
    norm.startsWith('state') ||
    norm.endsWith('state') ||
    (norm.includes('province') && !norm.includes('provincial'))
  )
}

function isCountryLabel(norm: string): boolean {
  if (!norm || norm.includes('county')) return false
  if (norm.includes('authoriz') || norm.includes('sponsor')) return false
  return norm === 'country' || norm.startsWith('country') || norm.endsWith('country')
}

function isWorkAuthLabel(norm: string): boolean {
  return (
    norm.includes('authorizedtowork') ||
    norm.includes('legallyauthorized') ||
    norm.includes('workauthorization') ||
    norm.includes('eligibletowork') ||
    norm.includes('authorizedtoworkfor') ||
    (norm.includes('authorized') && norm.includes('work'))
  )
}

function isSponsorshipLabel(norm: string): boolean {
  if (isWorkAuthLabel(norm)) return false
  return (
    norm.includes('sponsorship') ||
    (norm.includes('sponsor') &&
      (norm.includes('visa') || norm.includes('immigration') || norm.includes('work') || norm.includes('employ')))
  )
}

function isWorkStatusLabel(norm: string): boolean {
  return norm === 'workstatus' || norm === 'visastatus' || norm === 'citizenship' || norm.includes('employmenteligibility')
}

function looksLikeVeteran(field: JobviteField): boolean {
  return blob(field).toLowerCase().includes('veteran')
}

function isHispanicYesNo(field: JobviteField, norm: string): boolean {
  if (!norm.includes('hispanic') && !norm.includes('latino')) return false
  // "If no, what race" is the follow-up race list, not the Yes/No question.
  if (isConditionalRace(norm)) return false
  const choices = [field.optionLabel, ...(field.options || []).map((option) => option.text)]
    .map((value) => normalizeJobviteLabel(value))
    .filter(Boolean)
  // A radio only carries its own answer, so a lone Yes or No still counts.
  if (choices.length === 0) return norm.startsWith('areyouhispanic') || norm.startsWith('areyoulatino')
  return choices.every((choice) => choice === 'yes' || choice === 'no' || isDeclineLabel(choice))
}

function isConditionalRace(norm: string): boolean {
  return norm.includes('ifno') || norm.includes('ifyouansweredno') || norm.includes('ifnot')
}

export function jobviteRepeatKey(field: JobviteField): JobviteRepeatKey | null {
  const kind = classify(field)
  if (
    kind === 'company' ||
    kind === 'title' ||
    kind === 'expStart' ||
    kind === 'expEnd' ||
    kind === 'expDescription' ||
    kind === 'school' ||
    kind === 'degree' ||
    kind === 'major' ||
    kind === 'eduStart' ||
    kind === 'eduEnd' ||
    kind === 'city' ||
    kind === 'state' ||
    kind === 'postal' ||
    kind === 'country' ||
    kind === 'address'
  ) {
    return kind
  }
  return null
}

type Kind =
  | 'resume'
  | 'password'
  | 'out'
  | JobviteEeoKind
  | 'hispanic'
  | 'age'
  | 'workAuth'
  | 'sponsorship'
  | 'workStatus'
  | 'signatureName'
  | 'signatureDate'
  | 'firstName'
  | 'preferredName'
  | 'middleName'
  | 'lastName'
  | 'fullName'
  | 'email'
  | 'phone'
  | 'address'
  | 'address2'
  | 'city'
  | 'state'
  | 'postal'
  | 'country'
  | 'linkedin'
  | 'website'
  | 'github'
  | 'company'
  | 'title'
  | 'expStart'
  | 'expEnd'
  | 'expDescription'
  | 'school'
  | 'degree'
  | 'major'
  | 'eduStart'
  | 'eduEnd'
  | 'unknown'

function classify(field: JobviteField): Kind {
  const type = fieldType(field)
  const norm = labelOf(field)
  const auto = autoOf(field)
  const section = field.section || 'apply'

  if (type === 'password' || type === 'hidden') return 'password'
  if (isResume(field, norm)) return 'resume'
  if (isOutOfScope(norm)) return 'out'

  if (norm.includes('gender') || norm === 'sex') return 'gender'
  if (norm.includes('disability') || norm.includes('disabled')) return 'disability'
  if (norm.includes('veteran') || norm.includes('military') || (norm === 'chooseone' && looksLikeVeteran(field))) {
    return 'veteran'
  }
  if (isHispanicYesNo(field, norm)) return 'hispanic'
  if (
    norm.includes('ethnic') ||
    norm.includes('race') ||
    norm.includes('hispanic') ||
    norm.includes('latino')
  ) {
    return 'race'
  }
  if (
    norm.includes('18') &&
    (norm.includes('older') || norm.includes('yearsofage') || norm.includes('age') || norm.includes('over18'))
  ) {
    return 'age'
  }

  if (isWorkAuthLabel(norm)) return 'workAuth'
  if (isSponsorshipLabel(norm)) return 'sponsorship'
  if (isWorkStatusLabel(norm)) return 'workStatus'

  if (section === 'eeo' || section === 'ofccp') {
    if (
      norm === 'yourname' ||
      norm === 'signature' ||
      norm === 'printname' ||
      norm === 'applicantname'
    ) {
      return 'signatureName'
    }
    if (norm === 'todaysdate' || norm === 'datesigned' || norm.includes('signaturedate')) {
      return 'signatureDate'
    }
  }

  if (auto === 'given-name' || norm === 'firstname' || norm === 'givenname' || norm === 'forename') {
    return 'firstName'
  }
  if (norm === 'preferredfirstname' || norm === 'preferredname' || norm === 'nickname') {
    return 'preferredName'
  }
  if (auto === 'additional-name' || norm === 'middlename' || norm === 'middleinitial') {
    return 'middleName'
  }
  if (auto === 'family-name' || norm === 'lastname' || norm === 'surname' || norm === 'familyname') {
    return 'lastName'
  }
  if (norm === 'fullname' || norm === 'legalname' || norm === 'yourname' || norm === 'name') {
    return 'fullName'
  }

  if (auto === 'email' || type === 'email' || norm === 'email' || norm === 'emailaddress') return 'email'
  if (auto === 'tel' || type === 'tel' || isPhoneLabel(norm)) return 'phone'

  if (auto === 'address-line2' || norm.includes('addressline2') || norm.includes('address2') || norm === 'streetaddress2') {
    return 'address2'
  }
  if (
    auto === 'street-address' ||
    auto === 'address-line1' ||
    norm === 'address' ||
    norm === 'streetaddress' ||
    norm === 'street' ||
    norm.startsWith('address')
  ) {
    return 'address'
  }
  if (auto === 'address-level2' || norm === 'city' || norm === 'town') return 'city'
  if (auto === 'address-level1' || isStateLabel(norm)) return 'state'
  if (auto === 'postal-code' || norm.includes('zip') || norm.includes('postal')) return 'postal'
  if (auto === 'country' || auto === 'country-name' || isCountryLabel(norm)) return 'country'

  if (norm.includes('linkedin') || norm === 'profileurl') return 'linkedin'
  if (norm.includes('github')) return 'github'
  if (
    (norm.includes('website') || norm.includes('portfolio')) &&
    !norm.includes('company') &&
    !norm.includes('employer')
  ) {
    return 'website'
  }

  if (isCompanyLabel(norm)) return 'company'
  if (isTitleLabel(norm)) return 'title'
  if (isSchoolLabel(norm)) return 'school'
  if (isDegreeLabel(norm)) return 'degree'
  if (isMajorLabel(norm)) return 'major'
  const dates = dateKind(norm)
  if (dates) return dates
  if (isDescriptionLabel(norm)) return 'expDescription'

  return 'unknown'
}

function isCompanyLabel(norm: string): boolean {
  if (!norm || norm.includes('companysize') || norm.includes('companywebsite')) return false
  return (
    norm === 'company' ||
    norm === 'employer' ||
    norm === 'organization' ||
    norm.includes('companyname') ||
    norm.includes('employername') ||
    norm.includes('organizationname')
  )
}

function isTitleLabel(norm: string): boolean {
  if (norm.includes('ofinterest') || norm.includes('desiredposition') || norm.includes('applyingfor')) {
    return false
  }
  return norm === 'title' || norm === 'jobtitle' || norm === 'positiontitle' || norm === 'position'
}

function isSchoolLabel(norm: string): boolean {
  return (
    norm === 'school' ||
    norm.includes('schoolname') ||
    norm.includes('university') ||
    norm.includes('college') ||
    norm === 'institution' ||
    norm.includes('institutionname')
  )
}

function isDegreeLabel(norm: string): boolean {
  return norm === 'degree' || norm.includes('degreetype') || norm.includes('levelofeducation') || norm === 'educationlevel'
}

function isMajorLabel(norm: string): boolean {
  return (
    norm === 'major' ||
    norm.includes('fieldofstudy') ||
    norm === 'discipline' ||
    norm.includes('areaofstudy') ||
    norm.includes('courseofstudy')
  )
}

function isDescriptionLabel(norm: string): boolean {
  if (norm.includes('jobdescription') && norm.includes('posting')) return false
  return (
    norm.includes('responsibilit') ||
    norm.includes('duties') ||
    (norm.includes('description') &&
      (norm.includes('job') || norm.includes('work') || norm.includes('role') || norm.includes('position') || norm.includes('employ')))
  )
}

function dateKind(norm: string): 'expStart' | 'expEnd' | 'eduStart' | 'eduEnd' | null {
  const start = norm.includes('startdate') || norm.includes('fromdate') || norm.endsWith('start')
  const end =
    norm.includes('enddate') ||
    norm.includes('todate') ||
    norm.includes('graduation') ||
    norm.includes('graddate')
  if (!start && !end) return null
  const education =
    norm.includes('school') ||
    norm.includes('universit') ||
    norm.includes('education') ||
    norm.includes('degree') ||
    norm.includes('graduat')
  if (education) return end ? 'eduEnd' : 'eduStart'
  if (norm.includes('graduat')) return 'eduEnd'
  return end ? 'expEnd' : 'expStart'
}

function skip(): JobvitePlan {
  return { action: 'skip' }
}

function textPlan(value: string | null | undefined): JobvitePlan {
  const text = clean(value)
  return text ? { action: 'text', value: text } : skip()
}

function choicePlan(field: JobviteField, optionText: string | null, yesNo?: 'yes' | 'no' | null): JobvitePlan {
  const type = fieldType(field)
  if (type === 'radio' || type === 'checkbox') {
    if (!field.optionLabel) return skip()
    if (yesNo) {
      const option = normalizeJobviteLabel(field.optionLabel)
      if (option !== yesNo) return skip()
      return { action: 'click' }
    }
    if (!optionText) return skip()
    return normalizeJobviteLabel(field.optionLabel) === normalizeJobviteLabel(optionText)
      ? { action: 'click' }
      : skip()
  }
  if (type === 'select' || type.startsWith('select')) {
    const picked = optionText || (yesNo ? pickJobviteOption(field, [yesNo === 'yes' ? 'Yes' : 'No']) : null)
    return picked ? { action: 'select', optionText: picked } : skip()
  }
  if (yesNo) return { action: 'text', value: yesNo === 'yes' ? 'Yes' : 'No' }
  return textPlan(optionText)
}

function sponsorshipAnswer(info: JobviteProfile): 'yes' | 'no' | null {
  if (info.sponsorshipRequired === 'Yes') return 'yes'
  if (info.sponsorshipRequired === 'No') return 'no'
  const auth = info.workAuthorization || ''
  if (auth === 'work_visa' || auth === 'need_sponsorship') return 'yes'
  if (NO_SPONSORSHIP.has(auth)) return 'no'
  return null
}

function authorizedAnswer(info: JobviteProfile): 'yes' | 'no' | null {
  const auth = info.workAuthorization || ''
  if (!auth) return null
  if (AUTHORIZED_TO_WORK.has(auth)) return 'yes'
  if (auth === 'need_sponsorship' || auth === 'not_authorized') return 'no'
  return null
}

function pickWorkStatus(field: JobviteField, auth: string): string | null {
  const rows = optionRows(field).filter((row) => row.norm !== 'none' && !isDeclineLabel(row.text))
  const find = (pred: (norm: string) => boolean) => rows.find((row) => pred(row.norm))?.text || null
  if (auth === 'us_citizen') {
    return find(
      (norm) =>
        (norm.includes('citizen') || norm === 'us' || norm === 'usa') &&
        !norm.includes('notacitizen') &&
        !norm.includes('noncitizen'),
    )
  }
  if (auth === 'green_card') {
    return find(
      (norm) => norm.includes('permanentresident') || norm.includes('greencard') || norm.includes('lawfulpermanent'),
    )
  }
  if (auth === 'authorized_no_sponsorship') {
    return find(
      (norm) =>
        norm.includes('nosponsorship') ||
        norm.includes('withoutsponsorship') ||
        (norm.includes('authorized') && !norm.includes('sponsor')),
    )
  }
  if (auth === 'work_visa' || auth === 'need_sponsorship') {
    return find((norm) => {
      if (/h1|tnvisa|f1visa|opt|cpt/.test(norm)) return false
      return norm.includes('requiresponsor') || norm.includes('needsponsor') || norm === 'visa' || norm === 'workvisa'
    })
  }
  return null
}

function storedEeo(kind: JobviteEeoKind, info: JobviteProfile): string {
  if (!eeoEnabled(info)) return ''
  if (kind === 'gender') return clean(info.gender)
  if (kind === 'race') return clean(info.raceEthnicity)
  if (kind === 'veteran') return clean(info.veteranStatus)
  return clean(info.disabilityStatus)
}

export function jobviteEeoOptionMatches(kind: JobviteEeoKind, optionLabel: string, value: string): boolean {
  if (!value || isDeclineLabel(optionLabel)) return value === 'decline' && isDeclineLabel(optionLabel)
  if (kind === 'gender') return genderMatches(optionLabel, value)
  if (kind === 'race') return raceMatches(optionLabel, value)
  if (kind === 'veteran') return veteranMatches(optionLabel, value)
  return disabilityMatches(optionLabel, value)
}

function genderMatches(label: string, value: string): boolean {
  if (value === 'male') return (hasPhrase(label, 'male') || hasPhrase(label, 'man')) && !hasPhrase(label, 'female') && !hasPhrase(label, 'woman')
  if (value === 'female') return hasPhrase(label, 'female') || hasPhrase(label, 'woman')
  if (value === 'non_binary') return hasPhrase(label, 'non-binary') || hasPhrase(label, 'nonbinary')
  if (value === 'self_describe') return hasPhrase(label, 'self-describe') || hasPhrase(label, 'self describe')
  return false
}

function raceMatches(label: string, value: string): boolean {
  const norm = normalizeJobviteLabel(label)
  if (value === 'hispanic_or_latino') {
    if (norm.includes('nothispanic') || norm.includes('nonhispanic')) return false
    return hasPhrase(label, 'hispanic') || hasPhrase(label, 'latino')
  }
  // "White (Not Hispanic or Latino)" is the OFCCP label. A bare "Not Hispanic" line has no "white".
  if (value === 'white') return hasPhrase(label, 'white')
  if (value === 'black_or_african_american') return hasPhrase(label, 'black') || hasPhrase(label, 'african american')
  if (value === 'native_hawaiian_or_other_pacific_islander') {
    return hasPhrase(label, 'hawaiian') || hasPhrase(label, 'pacific islander')
  }
  if (value === 'asian') return hasPhrase(label, 'asian')
  if (value === 'american_indian_or_alaska_native') {
    return hasPhrase(label, 'american indian') || hasPhrase(label, 'alaska native') || hasPhrase(label, 'native american')
  }
  if (value === 'two_or_more_races') return hasPhrase(label, 'two or more') || hasPhrase(label, 'multiracial')
  return false
}

function veteranMatches(label: string, value: string): boolean {
  const notVeteran =
    hasPhrase(label, 'not a protected veteran') ||
    hasPhrase(label, 'not a veteran') ||
    hasPhrase(label, 'i am not')
  if (value === 'not_a_veteran') return notVeteran
  if (value === 'veteran') {
    if (notVeteran) return false
    return (
      hasPhrase(label, 'protected veteran') ||
      hasPhrase(label, 'i identify') ||
      hasPhrase(label, 'i am a veteran') ||
      normalizeJobviteLabel(label) === 'yes'
    )
  }
  return false
}

function disabilityMatches(label: string, value: string): boolean {
  const norm = normalizeJobviteLabel(label)
  if (value === 'no') {
    return norm === 'no' || hasPhrase(label, 'do not have') || hasPhrase(label, "don't have") || hasPhrase(label, 'no, i do not')
  }
  if (value === 'previously') {
    return hasPhrase(label, 'previously') || hasPhrase(label, 'have had one') || hasPhrase(label, 'had a disability')
  }
  if (value === 'yes') {
    if (norm === 'no' || hasPhrase(label, 'do not have')) return false
    return norm === 'yes' || hasPhrase(label, 'i have a disability') || hasPhrase(label, 'yes, i have')
  }
  return false
}

function eeoSelectText(kind: JobviteEeoKind, field: JobviteField, value: string): string | null {
  let best: { text: string; score: number } | null = null
  for (const row of optionRows(field)) {
    if (!jobviteEeoOptionMatches(kind, row.text, value)) continue
    const score = 200 - row.text.length
    if (!best || score > best.score) best = { text: row.text, score }
  }
  return best?.text ?? null
}

function formatInputDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function profileDate(value?: string | null): string | null {
  const text = clean(value)
  if (!text) return null
  const iso = text.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3] || '01'}`
  const year = text.match(/\b((?:19|20)\d{2})\b/)
  if (year && text.length <= 7) return `${year[1]}-01-01`
  return text
}

function writeDate(field: JobviteField, value: string | null): JobvitePlan {
  if (!value) return skip()
  const type = fieldType(field)
  if (type === 'select' || type.startsWith('select')) {
    const year = value.match(/((?:19|20)\d{2})/)?.[1]
    const picked = pickJobviteOption(field, [value, year || ''].filter(Boolean))
    return picked ? { action: 'select', optionText: picked } : skip()
  }
  return { action: 'text', value }
}

function degreeQueries(degree: string): string[] {
  const normalized = degree.toLowerCase()
  if (/ph\.?d|doctor/.test(normalized)) return [degree, 'Doctorate', 'PhD', 'Ph.D.']
  if (/master|mba|m\.s|m\.a/.test(normalized)) return [degree, "Master's", 'Master']
  if (/bachelor|b\.s|b\.a/.test(normalized)) return [degree, "Bachelor's", 'Bachelor']
  if (/associate/.test(normalized)) return [degree, 'Associate']
  if (/high school|ged|secondary/.test(normalized)) return [degree, 'High School', 'GED']
  return [degree]
}

function singleContact(kind: Kind, index: number): boolean {
  return SINGLE_CONTACT.has(kind as JobviteRepeatKey) && index > 0
}

export function jobvitePlan(
  field: JobviteField,
  info: JobviteProfile,
  index = 0,
  options?: { now?: Date },
): JobvitePlan {
  const kind = classify(field)
  if (kind === 'resume' || kind === 'password' || kind === 'out' || kind === 'unknown') return skip()
  if (singleContact(kind, index)) return skip()

  if (kind === 'gender' || kind === 'race' || kind === 'veteran' || kind === 'disability') {
    if (!eeoEnabled(info)) return skip()
    if (kind === 'race' && isConditionalRace(labelOf(field)) && info.raceEthnicity === 'hispanic_or_latino') {
      return skip()
    }
    const value = storedEeo(kind, info)
    if (!value) return skip()
    const type = fieldType(field)
    if (type === 'radio' || type === 'checkbox') {
      if (!field.optionLabel) return skip()
      return jobviteEeoOptionMatches(kind, field.optionLabel, value) ? { action: 'click' } : skip()
    }
    const picked = eeoSelectText(kind, field, value)
    return picked ? { action: 'select', optionText: picked } : skip()
  }

  if (kind === 'hispanic') {
    if (!eeoEnabled(info)) return skip()
    const race = clean(info.raceEthnicity)
    if (!race) return skip()
    const answer = race === 'hispanic_or_latino' ? 'yes' : 'no'
    return choicePlan(field, null, answer)
  }

  if (kind === 'age') {
    if (!eeoEnabled(info)) return skip()
    const answer = clean(info.age18OrOlder).toLowerCase()
    if (answer !== 'yes' && answer !== 'no') return skip()
    return choicePlan(field, null, answer)
  }

  if (kind === 'sponsorship') {
    const answer = sponsorshipAnswer(info)
    return answer ? choicePlan(field, null, answer) : skip()
  }

  if (kind === 'workAuth') {
    const answer = authorizedAnswer(info)
    if (!answer) return skip()
    const type = fieldType(field)
    if (type === 'select' || type.startsWith('select')) {
      const yesNo = pickJobviteOption(field, [answer === 'yes' ? 'Yes' : 'No'])
      if (yesNo) return { action: 'select', optionText: yesNo }
      const status = pickWorkStatus(field, info.workAuthorization || '')
      return status ? { action: 'select', optionText: status } : skip()
    }
    return choicePlan(field, null, answer)
  }

  if (kind === 'workStatus') {
    const auth = info.workAuthorization || ''
    if (!auth) return skip()
    const picked = pickWorkStatus(field, auth)
    if (!picked) return skip()
    return choicePlan(field, picked)
  }

  if (kind === 'signatureName') {
    if (!eeoEnabled(info)) return skip()
    return textPlan(jobviteFullName(info))
  }
  if (kind === 'signatureDate') {
    if (!eeoEnabled(info)) return skip()
    return { action: 'text', value: formatInputDate(options?.now ?? new Date()) }
  }

  if (kind === 'firstName' || kind === 'preferredName') return textPlan(info.firstName)
  if (kind === 'middleName') return textPlan(info.middleName)
  if (kind === 'lastName') return textPlan(info.lastName)
  if (kind === 'fullName') return textPlan(jobviteFullName(info))
  if (kind === 'email') return textPlan(info.email)
  if (kind === 'phone') return textPlan(jobvitePhoneValue(info))
  if (kind === 'address') return textPlan(info.address)
  if (kind === 'address2') return textPlan(info.addressLine2)
  if (kind === 'city') return textPlan(info.city)
  if (kind === 'postal') return textPlan(info.zip)
  if (kind === 'linkedin') return textPlan(info.linkedin)
  if (kind === 'website') return textPlan(info.website)
  if (kind === 'github') return textPlan(info.github)

  if (kind === 'state') {
    const names = stateNames(info.state)
    if (names.length === 0) return skip()
    const type = fieldType(field)
    if (type === 'select' || type.startsWith('select')) {
      const picked = pickJobviteOption(field, names)
      return picked ? { action: 'select', optionText: picked } : skip()
    }
    const full = names.find((name) => name.length > 2) || names[0]
    return textPlan(full)
  }

  if (kind === 'country') {
    const label = jobviteCountryLabel(info.country)
    if (!label) return skip()
    const type = fieldType(field)
    if (type === 'select' || type.startsWith('select')) {
      const picked = pickJobviteOption(field, [label, clean(info.country)])
      return picked ? { action: 'select', optionText: picked } : skip()
    }
    return textPlan(label)
  }

  if (kind === 'company' || kind === 'title' || kind === 'expDescription' || kind === 'expStart' || kind === 'expEnd') {
    const entry = info.experience?.[index]
    if (!entry) return skip()
    if (kind === 'company') return textPlan(entry.companyName)
    if (kind === 'title') return textPlan(entry.jobTitle)
    if (kind === 'expDescription') return textPlan(entry.description)
    if (kind === 'expEnd' && entry.present) return skip()
    return writeDate(field, profileDate(kind === 'expStart' ? entry.startDate : entry.endDate))
  }

  if (kind === 'school' || kind === 'degree' || kind === 'major' || kind === 'eduStart' || kind === 'eduEnd') {
    const entry = info.education?.[index]
    if (!entry) return skip()
    if (kind === 'school') return textPlan(entry.schoolName)
    if (kind === 'major') return textPlan(entry.major)
    if (kind === 'degree') {
      const degree = clean(entry.degreeType)
      if (!degree) return skip()
      const type = fieldType(field)
      if (type === 'select' || type.startsWith('select')) {
        const picked = pickJobviteOption(field, degreeQueries(degree))
        return picked ? { action: 'select', optionText: picked } : skip()
      }
      return textPlan(degree)
    }
    if (kind === 'eduEnd' && entry.current) return skip()
    return writeDate(field, profileDate(kind === 'eduStart' ? entry.startYear : entry.graduationYear))
  }

  return skip()
}
