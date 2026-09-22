// Pure mapping for hosted Lever apply forms (jobs.lever.co and other *.lever.co
// hosts). Questions are identified by input name plus the .application-label text,
// not by Greenhouse ids or Ashby data-field-path. DOM-free so the rules can be
// unit tested against the labels those pages actually render.

export type LeverProfile = {
  firstName?: string | null
  middleName?: string | null
  lastName?: string | null
  email?: string | null
  phone?: string | null
  phoneCountryCode?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  country?: string | null
  linkedin?: string | null
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
  }> | null
}

export type LeverField = {
  name?: string | null
  id?: string | null
  type?: string | null
  /** Question title from .application-label, not the option text. */
  label?: string | null
  /** Radio/checkbox answer text. Empty for text inputs and selects. */
  optionLabel?: string | null
  dataQa?: string | null
  className?: string | null
}

export type LeverPlan =
  | { action: 'text'; value: string }
  | { action: 'location' }
  | { action: 'select'; optionText: string }
  | { action: 'click' }
  /** Recognized repeating slot with nothing to write. Caller claims it so the
   * generic matcher does not copy entry 0 into a later row. */
  | { action: 'claim' }

export type LeverEeoKind = 'gender' | 'race' | 'veteran' | 'disability'

export type LeverEeoNote = { enabled: boolean; filled: boolean }

// Optional Mixpanel props. Null when the form had no EEO questions, so a contact-only
// success is unchanged. Unmapped or disabled questions set skipped and do not throw.
export function summarizeLeverEeo(notes: LeverEeoNote[]): {
  attempted: boolean
  filled: boolean
  skipped: boolean
} | null {
  if (notes.length === 0) return null
  const filled = notes.some((note) => note.filled)
  const skipped = notes.some((note) => !note.filled)
  const attempted = notes.some((note) => note.enabled)
  return {
    attempted,
    filled,
    skipped: skipped || !attempted,
  }
}

export type LeverRepeatKey =
  | 'company'
  | 'title'
  | 'school'
  | 'degree'
  | 'major'
  | 'expStart'
  | 'expEnd'
  | 'eduStart'
  | 'eduEnd'

const COUNTRY_LABELS: Record<string, string> = {
  united_states: 'United States',
  us: 'United States',
  usa: 'United States',
  canada: 'Canada',
  united_kingdom: 'United Kingdom',
  uk: 'United Kingdom',
  great_britain: 'United Kingdom',
}

const COUNTRY_OPTION_TOKENS: Record<string, string[]> = {
  united_states: ['usa', 'us', 'united states'],
  us: ['usa', 'us', 'united states'],
  usa: ['usa', 'us', 'united states'],
  canada: ['can', 'canada'],
  united_kingdom: ['gbr', 'gb', 'uk', 'united kingdom', 'great britain'],
  uk: ['gbr', 'gb', 'uk', 'united kingdom'],
  great_britain: ['gbr', 'gb', 'uk', 'united kingdom'],
}

const US_STATE_ABBREV: Record<string, string> = {
  alabama: 'al',
  alaska: 'ak',
  arizona: 'az',
  arkansas: 'ar',
  california: 'ca',
  colorado: 'co',
  connecticut: 'ct',
  delaware: 'de',
  florida: 'fl',
  georgia: 'ga',
  hawaii: 'hi',
  idaho: 'id',
  illinois: 'il',
  indiana: 'in',
  iowa: 'ia',
  kansas: 'ks',
  kentucky: 'ky',
  louisiana: 'la',
  maine: 'me',
  maryland: 'md',
  massachusetts: 'ma',
  michigan: 'mi',
  minnesota: 'mn',
  mississippi: 'ms',
  missouri: 'mo',
  montana: 'mt',
  nebraska: 'ne',
  nevada: 'nv',
  'new hampshire': 'nh',
  'new jersey': 'nj',
  'new mexico': 'nm',
  'new york': 'ny',
  'north carolina': 'nc',
  'north dakota': 'nd',
  ohio: 'oh',
  oklahoma: 'ok',
  oregon: 'or',
  pennsylvania: 'pa',
  'rhode island': 'ri',
  'south carolina': 'sc',
  'south dakota': 'sd',
  tennessee: 'tn',
  texas: 'tx',
  utah: 'ut',
  vermont: 'vt',
  virginia: 'va',
  washington: 'wa',
  'west virginia': 'wv',
  wisconsin: 'wi',
  wyoming: 'wy',
  'district of columbia': 'dc',
}

const AUTHORIZED_TO_WORK = new Set([
  'us_citizen',
  'green_card',
  'work_visa',
  'authorized_no_sponsorship',
])

const NOT_AUTHORIZED = new Set(['need_sponsorship', 'not_authorized'])

const NEEDS_SPONSORSHIP = new Set(['work_visa', 'need_sponsorship'])

const NO_SPONSORSHIP = new Set(['us_citizen', 'green_card', 'authorized_no_sponsorship'])

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export function normalizeLeverLabel(value: string | null | undefined): string {
  return (value || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function unique(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    const key = trimmed.toLowerCase()
    if (!trimmed || seen.has(key)) continue
    seen.add(key)
    result.push(trimmed)
  }
  return result
}

function clean(value: string | null | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim()
}

function fieldName(field: LeverField): string {
  return (field.name || '').trim()
}

function fieldType(field: LeverField): string {
  return (field.type || '').toLowerCase()
}

export function leverFullName(info: LeverProfile): string {
  return [info.firstName, info.middleName, info.lastName]
    .map((part) => clean(part))
    .filter(Boolean)
    .join(' ')
}

export function leverPhoneValue(info: LeverProfile): string {
  const phone = clean(info.phone)
  if (!phone) return ''
  if (phone.startsWith('+')) return phone
  const code = clean(info.phoneCountryCode)
  if (!code) return phone
  if (phone.startsWith(code)) return phone
  return `${code} ${phone}`.trim()
}

export function countryLabel(country?: string | null): string {
  const raw = clean(country)
  if (!raw) return ''
  const key = raw.toLowerCase().replace(/[\s-]+/g, '_')
  return COUNTRY_LABELS[key] || raw.replace(/_/g, ' ')
}

function displayState(state?: string | null): string {
  return clean(state).replace(/_/g, ' ')
}

function stateAbbrev(state?: string | null): string {
  const label = displayState(state).toLowerCase()
  if (!label) return ''
  if (label.length === 2) return label
  return US_STATE_ABBREV[label] || ''
}

export function leverLocationQueries(info: LeverProfile): string[] {
  const city = clean(info.city)
  const state = displayState(info.state)
  const queries: string[] = []
  // "San Francisco, California" is specific enough for Lever's /searchLocations
  // to return "San Francisco, CA, USA" instead of the other San Franciscos.
  if (city && state) queries.push(`${city}, ${state}`)
  if (city) queries.push(city)
  if (!city && state) queries.push(state)
  return unique(queries)
}

function countryTokens(country?: string | null): string[] {
  const key = clean(country)
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  return (
    COUNTRY_OPTION_TOKENS[key] ||
    (countryLabel(country) ? [countryLabel(country).toLowerCase()] : [])
  )
}

// Lever suggestions look like "San Francisco, CA, USA". Prefer the row whose city
// matches and whose trailing country token matches the profile.
export function pickLeverLocationOption(optionTexts: string[], info: LeverProfile): string | null {
  const city = clean(info.city).toLowerCase()
  const state = displayState(info.state).toLowerCase()
  const abbrev = stateAbbrev(info.state)
  const tokens = countryTokens(info.country)
  let best: { text: string; score: number } | null = null

  for (const raw of optionTexts) {
    const text = clean(raw)
    if (!text) continue
    const parts = text
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
    if (parts.length === 0) continue
    const first = parts[0].toLowerCase()
    if (city && first !== city && !first.startsWith(`${city} `)) continue

    const last = parts[parts.length - 1].toLowerCase()
    const countryClass = classifyCountryToken(last, tokens)
    if (countryClass === 'mismatch') continue

    let score = 0
    if (countryClass === 'match') score += 100
    if (city && first === city) score += 40
    else if (city) score += 10
    if (
      (state && parts.some((part) => part.toLowerCase() === state)) ||
      (abbrev && parts.some((part) => part.toLowerCase() === abbrev))
    ) {
      score += 30
    }
    if (!city && score === 0) continue
    if (!best || score > best.score) best = { text, score }
  }

  return best?.text ?? null
}

function classifyCountryToken(last: string, tokens: string[]): 'match' | 'mismatch' | 'unknown' {
  if (tokens.length === 0) return 'unknown'
  if (tokens.some((token) => token === last)) return 'match'
  // "San Francisco, CA" has no country yet. A 3-letter tail ("PHL") is a country.
  if (/^[a-z]{3}$/.test(last)) return 'mismatch'
  if (last.length > 3 && !tokens.some((token) => last.includes(token))) return 'mismatch'
  return 'unknown'
}

export function isLeverLocationAutocomplete(field: LeverField): boolean {
  const name = fieldName(field)
  const dataQa = (field.dataQa || '').toLowerCase()
  const className = (field.className || '').toLowerCase()
  if (name === 'selectedLocation') return false
  if (className.includes('candidate-location') || dataQa.includes('candidate-location'))
    return false
  return className.includes('location-input') || dataQa === 'location-input' || name === 'location'
}

export function isLeverResumeField(field: LeverField): boolean {
  const name = fieldName(field).toLowerCase()
  const dataQa = (field.dataQa || '').toLowerCase()
  const type = fieldType(field)
  return type === 'file' || name === 'resume' || dataQa === 'input-resume'
}

export function leverRepeatKey(field: LeverField): LeverRepeatKey | null {
  if (isLeverResumeField(field) || isLeverLocationAutocomplete(field)) return null
  if (leverEeoKind(field)) return null
  const name = fieldName(field).toLowerCase()
  if (name === 'org' || name === 'urls[linkedin]') return name === 'org' ? 'company' : null
  const label = normalizeLeverLabel(field.label)
  if (!label || isOutOfScopeLabel(label)) return null
  if (isCompanyLabel(label)) return 'company'
  if (isTitleLabel(label)) return 'title'
  if (isSchoolLabel(label)) return 'school'
  if (isDegreeLabel(label)) return 'degree'
  if (isMajorLabel(label)) return 'major'
  return dateRepeatKey(label)
}

function dateRepeatKey(label: string): LeverRepeatKey | null {
  const start = label.includes('startdate') || label.includes('fromdate') || label.endsWith('start')
  const end =
    label.includes('enddate') ||
    label.includes('todate') ||
    label.includes('graduation') ||
    label.includes('graddate')
  if (!start && !end) return null
  const education =
    label.includes('school') ||
    label.includes('universit') ||
    label.includes('education') ||
    label.includes('degree') ||
    label.includes('graduat')
  const experience =
    label.includes('employ') ||
    label.includes('company') ||
    label.includes('job') ||
    label.includes('work') ||
    label.includes('position')
  if (education && !experience) return end ? 'eduEnd' : 'eduStart'
  if (experience && !education) return end ? 'expEnd' : 'expStart'
  return null
}

function isOutOfScopeLabel(label: string): boolean {
  return (
    label.includes('howdidyouhear') ||
    label.includes('referral') ||
    label.includes('referredby') ||
    label.includes('whoreferred') ||
    label.includes('whydoyou') ||
    label.includes('whyareyou') ||
    label.includes('coverletter') ||
    label.includes('salary') ||
    label.includes('compensation') ||
    label.includes('pronoun') ||
    label.includes('agerange') ||
    label.includes('overtheage') ||
    label.includes('yearsofage') ||
    label.includes('relocat') ||
    label.includes('whichlocationareyouapplying') ||
    label.includes('locationareyouapplying') ||
    label.includes('ifother') ||
    label.includes('pleasespecify')
  )
}

function isCompanyLabel(label: string): boolean {
  if (label.includes('applying') || label.includes('family')) return false
  return (
    label === 'company' ||
    label.includes('currentcompany') ||
    label.includes('companyname') ||
    label.includes('currentemployer') ||
    label.includes('employer') ||
    label.includes('organization') ||
    label.includes('mostrecentcompany') ||
    label.includes('previouscompany') ||
    label.includes('prioremployer')
  )
}

function isTitleLabel(label: string): boolean {
  if (label.includes('applying') || label.includes('jobdescription') || label.includes('why'))
    return false
  return (
    label.includes('jobtitle') ||
    label.includes('positiontitle') ||
    label.includes('currenttitle') ||
    label.includes('titleat') ||
    label === 'title' ||
    label === 'position'
  )
}

function isSchoolLabel(label: string): boolean {
  if (label.includes('fieldofstudy') || label.includes('highschool')) return false
  return (
    label.includes('university') ||
    label.includes('college') ||
    label.includes('schoolname') ||
    label.includes('schoolattended') ||
    label === 'school'
  )
}

function isDegreeLabel(label: string): boolean {
  if (label.includes('fieldofstudy') || label.includes('major')) return false
  return (
    label.includes('highesteducation') ||
    label.includes('educationcompleted') ||
    label.includes('educationlevel') ||
    label.includes('levelofeducation') ||
    label.includes('degree')
  )
}

function isMajorLabel(label: string): boolean {
  return (
    label.includes('fieldofstudy') ||
    label.includes('major') ||
    label.includes('concentration') ||
    label.includes('discipline')
  )
}

export type LeverYesNo = 'yes' | 'no'

// Sponsorship is checked before "authorized", because "require work authorization"
// is a visa question, not "are you already authorized".
export function leverYesNoDecision(
  label: string | null | undefined,
  info: LeverProfile,
): LeverYesNo | null {
  const normalized = normalizeLeverLabel(label)
  if (!normalized || isOutOfScopeLabel(normalized)) return null

  const sponsorship =
    normalized.includes('sponsorship') ||
    ((normalized.includes('require') || normalized.includes('need')) &&
      (normalized.includes('visa') ||
        normalized.includes('workauthorization') ||
        normalized.includes('sponsor')))
  if (sponsorship) {
    if (info.sponsorshipRequired === 'Yes') return 'yes'
    if (info.sponsorshipRequired === 'No') return 'no'
    const auth = info.workAuthorization || ''
    if (NEEDS_SPONSORSHIP.has(auth)) return 'yes'
    if (NO_SPONSORSHIP.has(auth)) return 'no'
    return null
  }

  const authorized =
    normalized.includes('authorizedtowork') ||
    normalized.includes('legallyauthorized') ||
    normalized.includes('eligibletowork') ||
    (normalized.includes('authorized') && normalized.includes('work'))
  if (authorized) {
    const auth = info.workAuthorization || ''
    if (AUTHORIZED_TO_WORK.has(auth)) return 'yes'
    if (NOT_AUTHORIZED.has(auth)) return 'no'
  }

  return null
}

export function leverYesNoOption(label: string | null | undefined): LeverYesNo | null {
  const normalized = normalizeLeverLabel(label)
  if (normalized === 'yes') return 'yes'
  if (normalized === 'no') return 'no'
  return null
}

export function leverEeoKind(field: LeverField): LeverEeoKind | null {
  const name = fieldName(field).toLowerCase()
  if (name.includes('disabilitysignature')) return null
  if (name === 'eeo[gender]') return 'gender'
  if (name === 'eeo[race]') return 'race'
  if (name === 'eeo[veteran]') return 'veteran'
  if (name === 'eeo[disability]') return 'disability'

  const label = normalizeLeverLabel(field.label)
  if (!label || label.includes('pronoun') || label.includes('transitioning')) return null
  if (label.includes('gender')) return 'gender'
  if (label.includes('veteran') || label.includes('military')) return 'veteran'
  if (label.includes('disability') || label.includes('disabled')) return 'disability'
  if (label.includes('ethnic') || label.includes('race') || label.includes('hispanic'))
    return 'race'
  return null
}

function hasWord(label: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|[^a-z])${escaped}(?:[^a-z]|$)`, 'i').test(label)
}

function isDeclineLabel(label: string): boolean {
  const normalized = normalizeLeverLabel(label)
  return [
    'decline',
    'prefernot',
    'donotwish',
    'dontwish',
    'donotwant',
    'choosenot',
    'rather not',
  ].some((phrase) => normalized.includes(normalizeLeverLabel(phrase)))
}

function isPlaceholderOption(label: string): boolean {
  const normalized = normalizeLeverLabel(label)
  return (
    !normalized ||
    normalized === 'select' ||
    normalized.startsWith('select') ||
    normalized.startsWith('pleaseindicate')
  )
}

export function leverEeoOptionMatches(
  kind: LeverEeoKind,
  optionLabel: string,
  info: LeverProfile,
): boolean {
  if (info.eeoAnswersEnabled === false) return false
  const value =
    kind === 'gender'
      ? clean(info.gender)
      : kind === 'race'
        ? clean(info.raceEthnicity)
        : kind === 'veteran'
          ? clean(info.veteranStatus)
          : clean(info.disabilityStatus)

  if (!value || value === 'decline') return isDeclineLabel(optionLabel)
  if (isDeclineLabel(optionLabel)) return false

  if (kind === 'gender') return genderMatches(optionLabel, value)
  if (kind === 'race') return raceMatches(optionLabel, value)
  if (kind === 'veteran') return veteranMatches(optionLabel, value)
  return disabilityMatches(optionLabel, value)
}

function genderMatches(label: string, value: string): boolean {
  if (value === 'non_binary') return hasWord(label, 'non-binary') || hasWord(label, 'nonbinary')
  if (value === 'self_describe') {
    return (
      hasWord(label, 'self-describe') ||
      hasWord(label, 'self describe') ||
      hasWord(label, 'another term')
    )
  }
  if (value === 'female') return hasWord(label, 'female') || hasWord(label, 'woman')
  if (value === 'male') {
    if (hasWord(label, 'female') || hasWord(label, 'woman')) return false
    return hasWord(label, 'male') || hasWord(label, 'man')
  }
  return false
}

function raceMatches(label: string, value: string): boolean {
  const negatedHispanic =
    hasWord(label, 'not hispanic') ||
    hasWord(label, 'non-hispanic') ||
    hasWord(label, 'non hispanic')
  if (value === 'hispanic_or_latino') {
    return (
      !negatedHispanic &&
      (hasWord(label, 'hispanic') || hasWord(label, 'latino') || hasWord(label, 'latina'))
    )
  }
  if (value === 'white') return hasWord(label, 'white')
  if (value === 'black_or_african_american') {
    return hasWord(label, 'black') || hasWord(label, 'african american')
  }
  if (value === 'asian') return hasWord(label, 'asian')
  if (value === 'native_hawaiian_or_other_pacific_islander') {
    return hasWord(label, 'pacific') || hasWord(label, 'hawaiian')
  }
  if (value === 'american_indian_or_alaska_native') {
    return (
      hasWord(label, 'american indian') ||
      hasWord(label, 'alaska native') ||
      hasWord(label, 'native american')
    )
  }
  if (value === 'two_or_more_races')
    return hasWord(label, 'two or more') || hasWord(label, 'multiracial')
  return false
}

function veteranMatches(label: string, value: string): boolean {
  const negative =
    hasWord(label, 'not a veteran') ||
    hasWord(label, 'not a protected veteran') ||
    hasWord(label, 'i am not') ||
    normalizeLeverLabel(label) === 'no'
  if (negative) return value === 'not_a_veteran'
  if (normalizeLeverLabel(label) === 'yes') return value === 'veteran'
  if (value === 'veteran') {
    return (
      hasWord(label, 'i am a veteran') ||
      hasWord(label, 'i identify') ||
      hasWord(label, 'protected veteran')
    )
  }
  if (value === 'not_a_veteran') return hasWord(label, 'not a veteran')
  return false
}

function disabilityMatches(label: string, value: string): boolean {
  const normalized = normalizeLeverLabel(label)
  if (normalized === 'no' || hasWord(label, 'do not have') || hasWord(label, "don't have")) {
    return value === 'no'
  }
  if (
    normalized === 'yes' ||
    hasWord(label, 'i have a disability') ||
    hasWord(label, 'have had one')
  ) {
    return value === 'yes' || value === 'previously'
  }
  return false
}

export function pickLeverOptionText(optionTexts: string[], queries: string[]): string | null {
  const options = optionTexts
    .map((text) => clean(text))
    .filter((text) => text && !isPlaceholderOption(text))
  for (const query of queries) {
    const wanted = normalizeLeverLabel(query)
    if (!wanted) continue
    const exact = options.find((text) => normalizeLeverLabel(text) === wanted)
    if (exact) return exact
  }
  for (const query of queries) {
    const wanted = normalizeLeverLabel(query)
    if (wanted.length < 3) continue
    const partial = options.find((text) => normalizeLeverLabel(text).includes(wanted))
    if (partial) return partial
  }
  return null
}

export function leverEeoChoice(
  kind: LeverEeoKind,
  optionTexts: string[],
  info: LeverProfile,
): string | null {
  if (info.eeoAnswersEnabled === false) return null
  for (const text of optionTexts) {
    if (isPlaceholderOption(text)) continue
    if (leverEeoOptionMatches(kind, text, info)) return clean(text)
  }
  return null
}

export function pickLeverDegreeOption(optionTexts: string[], degree: string): string | null {
  const normalized = degree.toLowerCase()
  const needles = /ph\.?d|doctor/.test(normalized)
    ? ['phd', 'doctor']
    : /master|m\.s|m\.a|mba|msc/.test(normalized)
      ? ['master']
      : /bachelor|b\.s|b\.a|bsc/.test(normalized) || /^(bs|ba)$/.test(normalized.trim())
        ? ['bachelor']
        : /associate/.test(normalized)
          ? ['associate']
          : /high school|secondary/.test(normalized)
            ? ['highschool', 'secondary']
            : [normalizeLeverLabel(degree)]
  return pickLeverOptionText(optionTexts, needles)
}

export function schoolQueries(schoolName?: string | null): string[] {
  const trimmed = clean(schoolName)
  if (!trimmed) return []
  const simplified = trimmed.replace(/[.]/g, '').replace(/\s+/g, ' ').trim()
  const withoutParens = simplified.replace(/\s*\([^)]*\)/g, '').trim()
  return unique([trimmed, simplified, withoutParens])
}

function monthName(value?: string | null): string | null {
  if (!value?.trim()) return null
  const iso = value.match(/\b(?:19|20)\d{2}-(\d{2})\b/)
  if (iso) {
    const index = Number(iso[1]) - 1
    if (index >= 0 && index < 12) return MONTHS[index]
  }
  const lower = value.toLowerCase()
  return MONTHS.find((month) => lower.includes(month.toLowerCase())) ?? null
}

function yearOf(value?: string | null): string | null {
  const match = value?.match(/\b((?:19|20)\d{2})\b/)
  return match ? match[1] : null
}

export function leverPlan(
  field: LeverField,
  info: LeverProfile,
  index = 0,
  options?: { optionTexts?: string[]; now?: Date; disabilityAnswered?: boolean },
): LeverPlan | null {
  if (isLeverResumeField(field)) return null

  const name = fieldName(field)
  const type = fieldType(field)
  const label = clean(field.label)
  const normalized = normalizeLeverLabel(label)
  const optionTexts = options?.optionTexts || []

  if (name === 'eeo[disabilitySignature]' || name === 'eeo[disabilitySignatureDate]') {
    if (!options?.disabilityAnswered || info.eeoAnswersEnabled === false) return null
    if (name.endsWith('Date')) {
      const now = options.now ?? new Date()
      const month = String(now.getMonth() + 1).padStart(2, '0')
      const day = String(now.getDate()).padStart(2, '0')
      return { action: 'text', value: `${month}/${day}/${now.getFullYear()}` }
    }
    const signature = leverFullName(info)
    return signature ? { action: 'text', value: signature } : null
  }

  const repeatKey = leverRepeatKey(field)
  if (repeatKey && index >= 2) return { action: 'claim' }

  const eeoKind = leverEeoKind(field)
  if (eeoKind) {
    if (info.eeoAnswersEnabled === false) return null
    if (type === 'radio' || type === 'checkbox') {
      if (!field.optionLabel) return null
      return leverEeoOptionMatches(eeoKind, field.optionLabel, info) ? { action: 'click' } : null
    }
    const choice = leverEeoChoice(eeoKind, optionTexts, info)
    return choice ? { action: 'select', optionText: choice } : null
  }

  const yesNo = leverYesNoDecision(label, info)
  if (yesNo) {
    if (type === 'radio' || type === 'checkbox') {
      const option = leverYesNoOption(field.optionLabel)
      if (!option) return null
      return option === yesNo ? { action: 'click' } : null
    }
    if (type.startsWith('select')) {
      const choice = pickLeverOptionText(optionTexts, [yesNo === 'yes' ? 'Yes' : 'No'])
      return choice ? { action: 'select', optionText: choice } : null
    }
  }

  if (isLeverLocationAutocomplete(field)) {
    return leverLocationQueries(info).length > 0 ? { action: 'location' } : null
  }

  if (
    (field.className || '').toLowerCase().includes('candidate-location') ||
    (field.dataQa || '').toLowerCase().includes('candidate-location')
  ) {
    const country = countryLabel(info.country)
    if (!country) return null
    if (type.startsWith('select')) {
      const choice = pickLeverOptionText(optionTexts, [country])
      return choice ? { action: 'select', optionText: choice } : null
    }
    return { action: 'text', value: country }
  }

  if (
    name === 'name' ||
    normalized === 'fullname' ||
    normalized.includes('legalname') ||
    normalized === 'name'
  ) {
    if (normalized.includes('pronunciation') || normalized.includes('preferredname')) return null
    const full = leverFullName(info)
    return full ? { action: 'text', value: full } : null
  }

  if (isFirstNameLabel(normalized)) {
    const value = clean(info.firstName)
    return value ? { action: 'text', value } : null
  }
  if (isLastNameLabel(normalized)) {
    const value = clean(info.lastName)
    return value ? { action: 'text', value } : null
  }

  if (
    name === 'email' ||
    type === 'email' ||
    normalized === 'email' ||
    normalized === 'emailaddress'
  ) {
    const value = clean(info.email)
    return value ? { action: 'text', value } : null
  }

  if (
    name === 'phone' ||
    type === 'tel' ||
    normalized === 'phone' ||
    normalized === 'phonenumber' ||
    normalized.includes('mobilephone')
  ) {
    const value = leverPhoneValue(info)
    return value ? { action: 'text', value } : null
  }

  if (
    name.toLowerCase().includes('linkedin') ||
    (normalized.includes('linkedin') && !isOutOfScopeLabel(normalized))
  ) {
    const value = clean(info.linkedin)
    return value ? { action: 'text', value } : null
  }

  if (repeatKey === 'company' || repeatKey === 'title') {
    const entry = info.experience?.[index]
    if (!entry) return index > 0 ? { action: 'claim' } : null
    const value = clean(repeatKey === 'company' ? entry.companyName : entry.jobTitle)
    if (!value) return null
    return { action: 'text', value }
  }

  if (
    repeatKey === 'expStart' ||
    repeatKey === 'expEnd' ||
    repeatKey === 'eduStart' ||
    repeatKey === 'eduEnd'
  ) {
    return datePlan(field, info, index, repeatKey, optionTexts)
  }

  if (repeatKey === 'school' || repeatKey === 'degree' || repeatKey === 'major') {
    return educationPlan(field, info, index, repeatKey, optionTexts)
  }

  if (isCityLabel(normalized)) {
    const value = clean(info.city)
    return value ? { action: 'text', value } : null
  }
  if (isStateLabel(normalized)) {
    const value = displayState(info.state)
    if (!value) return null
    if (type.startsWith('select')) {
      const choice = pickLeverOptionText(
        optionTexts,
        unique([value, stateAbbrev(info.state).toUpperCase()]),
      )
      return choice ? { action: 'select', optionText: choice } : null
    }
    return { action: 'text', value }
  }
  if (isZipLabel(normalized)) {
    const value = clean(info.zip)
    return value ? { action: 'text', value } : null
  }
  if (isCountryLabel(normalized)) {
    const value = countryLabel(info.country)
    if (!value) return null
    if (type.startsWith('select')) {
      const choice = pickLeverOptionText(optionTexts, [value])
      return choice ? { action: 'select', optionText: choice } : null
    }
    return { action: 'text', value }
  }
  if (
    normalized.includes('city') &&
    normalized.includes('state') &&
    !normalized.includes('whichlocation')
  ) {
    const city = clean(info.city)
    const state = displayState(info.state)
    const value = [city, state].filter(Boolean).join(', ')
    return value ? { action: 'text', value } : null
  }

  return null
}

function educationPlan(
  field: LeverField,
  info: LeverProfile,
  index: number,
  key: 'school' | 'degree' | 'major',
  optionTexts: string[],
): LeverPlan | null {
  const entry = info.education?.[index]
  if (!entry) return index > 0 ? { action: 'claim' } : null
  const type = fieldType(field)
  if (key === 'school') {
    const queries = schoolQueries(entry.schoolName)
    if (queries.length === 0) return null
    if (type.startsWith('select')) {
      const choice = pickLeverOptionText(optionTexts, queries)
      return choice ? { action: 'select', optionText: choice } : null
    }
    return { action: 'text', value: queries[0] }
  }
  if (key === 'degree') {
    const degree = clean(entry.degreeType)
    if (!degree) return null
    if (type.startsWith('select')) {
      const choice = pickLeverDegreeOption(optionTexts, degree)
      return choice ? { action: 'select', optionText: choice } : null
    }
    return { action: 'text', value: degree }
  }
  const major = clean(entry.major)
  if (!major) return null
  if (type.startsWith('select')) {
    const choice = pickLeverOptionText(optionTexts, [major])
    return choice ? { action: 'select', optionText: choice } : null
  }
  return { action: 'text', value: major }
}

function datePlan(
  field: LeverField,
  info: LeverProfile,
  index: number,
  key: LeverRepeatKey,
  optionTexts: string[],
): LeverPlan | null {
  const education = key === 'eduStart' || key === 'eduEnd'
  const entry = education ? info.education?.[index] : info.experience?.[index]
  if (!entry) return index > 0 ? { action: 'claim' } : null
  const source = education
    ? key === 'eduStart'
      ? info.education?.[index]?.startYear
      : info.education?.[index]?.current
        ? ''
        : info.education?.[index]?.graduationYear
    : key === 'expStart'
      ? info.experience?.[index]?.startDate
      : info.experience?.[index]?.present
        ? ''
        : info.experience?.[index]?.endDate
  if (!source) return null
  const type = fieldType(field)
  const month = monthName(source)
  const year = yearOf(source)
  if (type.startsWith('select')) {
    const looksLikeYear = optionTexts.some((text) => /^\d{4}$/.test(clean(text)))
    const query = looksLikeYear ? year : month
    if (!query) return null
    const choice = pickLeverOptionText(optionTexts, [query])
    return choice ? { action: 'select', optionText: choice } : null
  }
  return { action: 'text', value: clean(source) }
}

function isFirstNameLabel(label: string): boolean {
  return label === 'firstname' || label === 'givenname' || label === 'legalfirstname'
}

function isLastNameLabel(label: string): boolean {
  return (
    label === 'lastname' ||
    label === 'surname' ||
    label === 'familyname' ||
    label === 'legallastname'
  )
}

function isCityLabel(label: string): boolean {
  if (label.includes('location') || label.includes('university') || label.includes('sponsor'))
    return false
  return (
    label === 'city' ||
    label.includes('addresscity') ||
    (label.includes('address') && label.endsWith('city'))
  )
}

function isStateLabel(label: string): boolean {
  if (label.includes('unitedstates') || label.includes('statement') || label.includes('estate'))
    return false
  return (
    label === 'state' ||
    label.includes('addressstate') ||
    (label.includes('address') && label.endsWith('state'))
  )
}

function isZipLabel(label: string): boolean {
  return label === 'zip' || label === 'zipcode' || label.includes('postal')
}

function isCountryLabel(label: string): boolean {
  if (label.includes('sponsor') || label.includes('nationality') || label.includes('authorized'))
    return false
  return (
    label === 'country' ||
    label.includes('addresscountry') ||
    (label.includes('address') && label.endsWith('country'))
  )
}
