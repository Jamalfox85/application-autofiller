// Pure Ashby application-form mapping for hosted boards (*.ashbyhq.com).
// Questions are keyed by data-field-path, not Greenhouse-style ids. These
// helpers stay DOM-free so they can be unit tested.

export type AshbyProfile = {
  firstName?: string | null
  middleName?: string | null
  lastName?: string | null
  email?: string | null
  phone?: string | null
  phoneCountryCode?: string | null
  city?: string | null
  state?: string | null
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
  }> | null
}

export type AshbyTextTarget = {
  path?: string | null
  title?: string | null
  id?: string | null
  type?: string | null
}

const COUNTRY_LABELS: Record<string, string> = {
  united_states: 'United States',
  us: 'United States',
  usa: 'United States',
  canada: 'Canada',
  united_kingdom: 'United Kingdom',
  uk: 'United Kingdom',
  great_britain: 'United Kingdom',
}

// Trailing tokens Ashby actually renders ("United States", "USA", "US").
const COUNTRY_OPTION_TOKENS: Record<string, string[]> = {
  united_states: ['united states', 'united states of america', 'usa', 'us'],
  us: ['united states', 'united states of america', 'usa', 'us'],
  usa: ['united states', 'united states of america', 'usa', 'us'],
  canada: ['canada'],
  united_kingdom: ['united kingdom', 'uk', 'great britain', 'britain', 'gb'],
  uk: ['united kingdom', 'uk', 'great britain', 'britain', 'gb'],
  great_britain: ['united kingdom', 'uk', 'great britain', 'britain', 'gb'],
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
  'washington dc': 'dc',
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

export function normalizeAshbyLabel(value: string | null | undefined): string {
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

function countryLabel(country?: string | null): string {
  if (!country?.trim()) return ''
  const key = country.trim().toLowerCase().replace(/[\s-]+/g, '_')
  return COUNTRY_LABELS[key] || country.replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
}

export function ashbyFullName(info: AshbyProfile): string {
  return [info.firstName, info.middleName, info.lastName]
    .map((part) => (part || '').trim())
    .filter(Boolean)
    .join(' ')
}

// Ashby's phone widget is one tel input (placeholder "1-415-555-1234..."), not a
// separate dialing-code combobox. Prefix the stored calling code when the number
// itself has no country prefix.
export function ashbyPhoneValue(info: AshbyProfile): string {
  const phone = (info.phone || '').trim()
  if (!phone) return ''
  if (phone.startsWith('+')) return phone
  const code = (info.phoneCountryCode || '').trim()
  if (!code) return phone
  if (phone.startsWith(code)) return phone
  return `${code} ${phone}`.trim()
}

// Geo autocomplete suggestions look like "San Francisco, California, United States".
// "City, State" is specific enough to prefix the right row; country is the fallback
// for country-only questions ("Which country do you intend to work from?").
export function ashbyLocationQueries(info: AshbyProfile): string[] {
  const city = (info.city || '').trim()
  const state = (info.state || '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
  const country = countryLabel(info.country)
  const queries: string[] = []
  if (city && state) queries.push(`${city}, ${state}`)
  if (city) queries.push(city)
  if (state && country) queries.push(`${state}, ${country}`)
  if (country) queries.push(country)
  return unique(queries)
}

// Plain text Location questions (Render) take one value. Autocomplete fields
// still search the full query list.
export function ashbyLocationText(info: AshbyProfile): string {
  return ashbyLocationQueries(info)[0] || ''
}

// Geo rows share a city prefix ("San Francisco, Córdoba, Argentina" and
// "San Francisco, California, United States"). A shortest-prefix match picks the
// foreign homonym. Prefer the vault country and state; return null when no row
// is that place so the fill can leave the field blank instead of clicking it.
export function pickAshbyLocationOption(optionTexts: string[], info: AshbyProfile): string | null {
  const city = normalizeAshbyPlace(info.city)
  const stateForms = ashbyStateForms(info.state)
  const tokens = ashbyCountryTokens(info.country)
  let best: { text: string; score: number } | null = null

  for (const raw of optionTexts) {
    const text = collapseAshbyOption(raw)
    if (!text) continue
    const parts = text
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
    if (parts.length === 0) continue
    const norms = parts.map((part) => normalizeAshbyPlace(part))

    const countryClass = classifyAshbyCountry(norms, tokens, stateForms)
    if (countryClass === 'mismatch') continue
    const stateClass = classifyAshbyState(norms, stateForms, tokens)
    if (stateClass === 'mismatch') continue

    const first = norms[0] || ''
    const cityExact = !!city && first === city
    const cityLoose = !!city && !cityExact && placeContains(first, city)
    const countryOnly = !cityExact && !cityLoose && countryClass === 'match' && parts.length === 1

    if (city && !cityExact && !cityLoose && !countryOnly) continue
    if (!city && stateClass !== 'match' && countryClass !== 'match') continue

    const confident =
      countryClass === 'match' ||
      (stateClass === 'match' && (cityExact || !city)) ||
      (tokens.length === 0 && stateForms.length === 0 && cityExact)
    if (!confident) continue

    let score = 0
    // A bare "United States" row is a country-question fallback. It must not beat
    // "San Francisco, CA", whose country segment is only the state abbreviation.
    if (countryClass === 'match' && !countryOnly) score += 100
    if (cityExact) score += 40
    else if (cityLoose) score += 5
    else if (countryOnly) score += 15
    if (stateClass === 'match') score += 30
    if (!best || score > best.score) best = { text, score }
  }

  return best?.text ?? null
}

function ashbyCountryTokens(country?: string | null): string[] {
  const key = (country || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  const listed = COUNTRY_OPTION_TOKENS[key] || []
  const label = countryLabel(country)
  const tokens = new Set<string>()
  for (const token of [...listed, label]) {
    const normalized = normalizeAshbyPlace(token)
    if (normalized) tokens.add(normalized)
  }
  return [...tokens]
}

function ashbyStateForms(state?: string | null): string[] {
  const label = normalizeAshbyPlace((state || '').replace(/_/g, ' '))
  if (!label) return []
  const forms = new Set<string>([label])
  const abbrev = US_STATE_ABBREV[label]
  if (abbrev) forms.add(abbrev)
  for (const [name, code] of Object.entries(US_STATE_ABBREV)) {
    if (code === label) forms.add(name)
  }
  return [...forms]
}

function classifyAshbyCountry(
  norms: string[],
  tokens: string[],
  stateForms: string[],
): 'match' | 'mismatch' | 'unknown' {
  if (tokens.length === 0) return 'unknown'
  const last = norms[norms.length - 1] || ''
  if (!last) return 'unknown'
  if (tokens.includes(last)) return 'match'
  if (stateForms.includes(last)) return 'unknown'
  // A lone city has no country segment. Two-letter tails ("CA") are states.
  if (norms.length === 1 || last.length <= 2) return 'unknown'
  return 'mismatch'
}

function classifyAshbyState(
  norms: string[],
  stateForms: string[],
  tokens: string[],
): 'match' | 'mismatch' | 'unknown' {
  if (stateForms.length === 0) return 'unknown'
  const regionParts = norms.length === 1 ? norms : norms.slice(1)
  if (regionParts.some((part) => stateForms.includes(part))) return 'match'
  if (norms.length < 2) return 'unknown'
  // "City, Country" has no region. Any other region is a different place.
  if (tokens.includes(norms[1] || '')) return 'unknown'
  return 'mismatch'
}

function placeContains(label: string, city: string): boolean {
  return label.startsWith(`${city} `) || label.endsWith(` ${city}`) || label.includes(` ${city} `)
}

function collapseAshbyOption(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeAshbyPlace(value: string | null | undefined): string {
  return (value || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function ashbySchoolQueries(schoolName?: string | null): string[] {
  if (!schoolName?.trim()) return []
  const trimmed = schoolName.trim()
  const simplified = trimmed.replace(/[.]/g, '').replace(/\s+/g, ' ').trim()
  const withoutParens = simplified.replace(/\s*\([^)]*\)/g, '').trim()
  return unique([trimmed, simplified, withoutParens])
}

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

export function ashbyMonthName(value?: string | null): string | null {
  if (!value?.trim()) return null
  const iso = value.match(/\b(?:19|20)\d{2}-(\d{2})\b/)
  if (iso) {
    const index = Number(iso[1]) - 1
    if (index >= 0 && index < 12) return MONTHS[index]
  }
  const lower = value.toLowerCase()
  return MONTHS.find((month) => lower.includes(month.toLowerCase())) ?? null
}

export function ashbyYear(value?: string | null): string | null {
  const match = value?.match(/\b((?:19|20)\d{2})\b/)
  return match ? match[1] : null
}

export function isAshbyLocationField(path?: string | null, title?: string | null): boolean {
  if ((path || '') === '_systemfield_location') return true
  const normalized = normalizeAshbyLabel(title)
  if (!normalized || normalized.includes('sponsorship') || normalized.includes('authorized')) {
    return false
  }
  return (
    normalized === 'location' ||
    normalized.includes('currentlocation') ||
    normalized.includes('wheredoyoulive') ||
    normalized.includes('whereareyoulocated') ||
    normalized.includes('whichcountry')
  )
}

export function isAshbySchoolField(
  target: AshbyTextTarget,
  hints: { placeholder?: string | null; autocomplete?: boolean },
): boolean {
  if ((target.id || '').endsWith('-school')) return true
  if ((hints.placeholder || '').toLowerCase().includes('school')) return true
  // The school typeahead has no id. Degree/major inputs and the month/year
  // selects sit in the same education field, so this fallback is only for the
  // autocomplete widget.
  return (
    !!hints.autocomplete &&
    (target.path || '') === '_systemfield_education_history' &&
    !(target.id || '').trim()
  )
}

// Hosted forms repeat education with "+ Add Education". Entries share one field
// path, so the caller passes the entry index (0 or 1). A third row is ignored.
export const ASHBY_EDUCATION_ENTRY_LIMIT = 2

export function ashbyEducationEntryHasData(
  row: NonNullable<AshbyProfile['education']>[number] | null | undefined,
): boolean {
  if (!row) return false
  return [row.schoolName, row.degreeType, row.major, row.startYear, row.graduationYear].some(
    (value) => !!(value || '').trim(),
  )
}

// Click "+ Add Education" only when the form is showing fewer rows than the
// profile has, and never past the second entry.
export function shouldRevealAshbyEducationEntry(renderedCount: number, info: AshbyProfile): boolean {
  if (renderedCount < 1 || renderedCount >= ASHBY_EDUCATION_ENTRY_LIMIT) return false
  return ashbyEducationEntryHasData(info.education?.[renderedCount])
}

export function ashbyEducationTextValue(
  id: string | null | undefined,
  info: AshbyProfile,
  index = 0,
): string {
  if (index < 0 || index >= ASHBY_EDUCATION_ENTRY_LIMIT) return ''
  const education = info.education?.[index]
  if (!education || !id) return ''
  if (id.endsWith('-degree')) return (education.degreeType || '').trim()
  if (id.endsWith('-major')) return (education.major || '').trim()
  return ''
}

export type AshbyDateKind = 'month' | 'year'

// Education start/end controls are a pair of native <select>s (January… / 1990…).
// The placeholder option or the option labels tell the two apart.
export function ashbyDateSelectKind(optionLabels: string[]): AshbyDateKind | null {
  const labels = optionLabels.map((label) => label.trim().toLowerCase())
  if (labels.some((label) => label === 'january' || label.startsWith('month'))) return 'month'
  if (labels.some((label) => label.startsWith('year') || /^\d{4}$/.test(label))) return 'year'
  return null
}

export function ashbyEducationDateValue(
  containerId: string | null | undefined,
  kind: AshbyDateKind,
  info: AshbyProfile,
  index = 0,
): string {
  if (index < 0 || index >= ASHBY_EDUCATION_ENTRY_LIMIT) return ''
  const education = info.education?.[index]
  if (!education || !containerId) return ''
  const source = containerId.endsWith('-startDate')
    ? education.startYear
    : containerId.endsWith('-endDate')
      ? education.current
        ? ''
        : education.graduationYear
      : ''
  if (!source) return ''
  return kind === 'month' ? ashbyMonthName(source) || '' : ashbyYear(source) || ''
}

export type AshbyYesNo = 'yes' | 'no'

// Boolean questions are either a Yes/No button pair (data-option) or a short radio
// group. Returns null when the question is not one we can answer from the profile.
export function ashbyYesNoDecision(title: string | null | undefined, info: AshbyProfile): AshbyYesNo | null {
  const normalized = normalizeAshbyLabel(title)
  if (!normalized) return null

  const workAuthQuestion =
    normalized.includes('authorizedtowork') ||
    normalized.includes('legallyauthorized') ||
    normalized.includes('workauthorization') ||
    normalized.includes('eligibletowork')
  // Authorization wins when a question also mentions sponsorship. 1Password asks
  // one Yes/No: already authorized, and they will not sponsor. Yes means authorized.
  if (workAuthQuestion) {
    const auth = info.workAuthorization || ''
    if (AUTHORIZED_TO_WORK.has(auth)) return 'yes'
    if (NOT_AUTHORIZED.has(auth)) return 'no'
    return null
  }

  // "sponsorship" (Ashby), "sponsor an immigration case" (Notion), and
  // "immigration-related support or sponsorship" (Plaid).
  const sponsorshipQuestion =
    normalized.includes('sponsorship') ||
    (normalized.includes('sponsor') &&
      (normalized.includes('visa') || normalized.includes('immigration') || normalized.includes('employ')))
  if (sponsorshipQuestion) {
    if (info.sponsorshipRequired === 'Yes') return 'yes'
    if (info.sponsorshipRequired === 'No') return 'no'
    const auth = info.workAuthorization || ''
    if (NEEDS_SPONSORSHIP.has(auth)) return 'yes'
    if (NO_SPONSORSHIP.has(auth)) return 'no'
    return null
  }

  const ageQuestion =
    normalized.includes('18') &&
    (normalized.includes('older') || normalized.includes('yearsofage') || normalized.includes('age'))
  if (ageQuestion) {
    if (info.eeoAnswersEnabled === false) return null
    if (info.age18OrOlder === 'yes') return 'yes'
    if (info.age18OrOlder === 'no') return 'no'
  }

  return null
}

export function ashbyYesNoOption(label: string | null | undefined): AshbyYesNo | null {
  const normalized = normalizeAshbyLabel(label)
  if (normalized === 'yes') return 'yes'
  if (normalized === 'no') return 'no'
  return null
}

export type AshbyEeoKind = 'gender' | 'race' | 'veteran' | 'disability'

const ASHBY_EEO_KINDS: AshbyEeoKind[] = ['gender', 'race', 'veteran', 'disability']

export type AshbyEeoKindState = {
  seen: boolean
  valued: boolean
  filled: boolean
}

export function freshAshbyEeoTally(): Record<AshbyEeoKind, AshbyEeoKindState> {
  return {
    gender: { seen: false, valued: false, filled: false },
    race: { seen: false, valued: false, filled: false },
    veteran: { seen: false, valued: false, filled: false },
    disability: { seen: false, valued: false, filled: false },
  }
}

export function ashbyEeoStoredValue(kind: AshbyEeoKind, info: AshbyProfile): string {
  if (info.eeoAnswersEnabled === false) return ''
  const value =
    kind === 'gender'
      ? info.gender
      : kind === 'race'
        ? info.raceEthnicity
        : kind === 'veteran'
          ? info.veteranStatus
          : info.disabilityStatus
  const text = (value || '').trim()
  return text
}

export function observeAshbyEeoField(
  tally: Record<AshbyEeoKind, AshbyEeoKindState>,
  kind: AshbyEeoKind,
  info: AshbyProfile,
) {
  const slot = tally[kind]
  slot.seen = true
  if (ashbyEeoStoredValue(kind, info)) slot.valued = true
}

export function markAshbyEeoFilled(
  tally: Record<AshbyEeoKind, AshbyEeoKindState>,
  kind: AshbyEeoKind,
) {
  const slot = tally[kind]
  slot.seen = true
  slot.valued = true
  slot.filled = true
}

// Four questions. A filled question is also attempted. Everything else is skipped
// (missing field, empty vault value, answers turned off, or an unmapped control).
export function ashbyEeoTelemetry(tally: Record<AshbyEeoKind, AshbyEeoKindState>): {
  eeo_attempted: number
  eeo_filled: number
  eeo_skipped: number
} {
  let attempted = 0
  let filled = 0
  let skipped = 0
  for (const kind of ASHBY_EEO_KINDS) {
    const slot = tally[kind]
    if (slot.filled) {
      attempted += 1
      filled += 1
    } else if (slot.seen && slot.valued) {
      attempted += 1
      skipped += 1
    } else {
      skipped += 1
    }
  }
  return { eeo_attempted: attempted, eeo_filled: filled, eeo_skipped: skipped }
}

export function ashbyEeoKind(title: string | null | undefined): AshbyEeoKind | null {
  const normalized = normalizeAshbyLabel(title)
  if (!normalized) return null
  if (normalized.includes('gender')) return 'gender'
  if (normalized.includes('veteran') || normalized.includes('military')) return 'veteran'
  if (normalized.includes('disability') || normalized.includes('disabled')) return 'disability'
  if (
    normalized.includes('ethnic') ||
    normalized.includes('race') ||
    normalized.includes('hispanic')
  ) {
    return 'race'
  }
  return null
}

function isDeclineOption(label: string): boolean {
  const normalized = normalizeAshbyLabel(label)
  return [
    'decline',
    'prefernot',
    'donotwish',
    'dontwish',
    'donotwant',
    'choosenot',
    'rather not',
  ].some((phrase) => normalized.includes(normalizeAshbyLabel(phrase)))
}

function labelHas(label: string, phrases: string[]): boolean {
  const normalized = normalizeAshbyLabel(label)
  return phrases.some((phrase) => normalized.includes(normalizeAshbyLabel(phrase)))
}

const GENDER_PHRASES: Record<string, string[]> = {
  male: ['male', 'man'],
  female: ['female', 'woman'],
  non_binary: ['non-binary', 'nonbinary', 'non binary'],
  self_describe: ['self-describe', 'self describe', 'another gender', 'prefer to self'],
}

const RACE_PHRASES: Record<string, string[]> = {
  hispanic_or_latino: ['hispanic', 'latino'],
  white: ['white'],
  black_or_african_american: ['black', 'african american'],
  native_hawaiian_or_other_pacific_islander: ['hawaiian', 'pacific islander'],
  asian: ['asian'],
  american_indian_or_alaska_native: ['american indian', 'alaska native', 'native american', 'indigenous'],
  two_or_more_races: ['two or more', 'multiracial', 'multiple races'],
}

const VETERAN_PHRASES: Record<string, string[]> = {
  veteran: ['i identify', 'protected veteran', 'i am a veteran', 'yes'],
  not_a_veteran: ['not a protected veteran', 'not a veteran', 'i am not'],
}

const DISABILITY_PHRASES: Record<string, string[]> = {
  yes: ['yes, i have', 'yes i have', 'have a disability', 'person with disability'],
  no: ["no, i don't", 'no, i do not', 'do not have a disability', 'i do not have'],
  previously: ['previously', 'had a disability', 'have had one'],
}

function phrasesMatch(label: string, phrases: string[] | undefined): boolean {
  if (!phrases || isDeclineOption(label)) return false
  if (phrases === GENDER_PHRASES.male) {
    return labelHas(label, phrases) && !labelHas(label, ['female', 'woman'])
  }
  if (phrases === VETERAN_PHRASES.veteran) {
    // "I am not a protected veteran" contains "protected veteran".
    if (labelHas(label, ['not a protected', 'not a veteran', 'i am not'])) return false
    // "Yes" alone is too broad on a multi-question page; require a veteran cue
    // unless the option is exactly Yes (common on a dedicated veteran question).
    if (normalizeAshbyLabel(label) === 'yes') return true
    return labelHas(label, phrases.filter((phrase) => phrase !== 'yes'))
  }
  if (phrases === RACE_PHRASES.hispanic_or_latino) {
    // "White (Not Hispanic or Latino)" is the white option, not Hispanic.
    const normalized = normalizeAshbyLabel(label)
    if (normalized.includes('nothispanic') || normalized.includes('nonhispanic')) return false
    return labelHas(label, phrases)
  }
  return labelHas(label, phrases)
}

export function ashbyEeoOptionMatches(
  kind: AshbyEeoKind,
  optionLabel: string,
  info: AshbyProfile,
): boolean {
  if (info.eeoAnswersEnabled === false) return false
  const value =
    kind === 'gender'
      ? info.gender || ''
      : kind === 'race'
        ? info.raceEthnicity || ''
        : kind === 'veteran'
          ? info.veteranStatus || ''
          : info.disabilityStatus || ''

  // Empty values are a skip: do not pick a decline option just because the
  // profile left the answer blank. An explicit stored decline still may.
  if (!value) return false
  if (value === 'decline') return isDeclineOption(optionLabel)

  const table =
    kind === 'gender'
      ? GENDER_PHRASES
      : kind === 'race'
        ? RACE_PHRASES
        : kind === 'veteran'
          ? VETERAN_PHRASES
          : DISABILITY_PHRASES
  return phrasesMatch(optionLabel, table[value])
}

// Labels to type into a searchable ValueSelect (Ashby uses one when a question
// has more than eight choices). Order is most-specific first.
// Veteran and disability questions are sometimes a Yes/No button pair instead of
// the long OFCCP option list. Gender and race are not.
export function ashbyEeoYesNo(kind: AshbyEeoKind, info: AshbyProfile): AshbyYesNo | null {
  if (info.eeoAnswersEnabled === false) return null
  if (kind === 'veteran') {
    if (info.veteranStatus === 'veteran') return 'yes'
    if (info.veteranStatus === 'not_a_veteran') return 'no'
    return null
  }
  if (kind === 'disability') {
    if (info.disabilityStatus === 'yes' || info.disabilityStatus === 'previously') return 'yes'
    if (info.disabilityStatus === 'no') return 'no'
  }
  return null
}

export function ashbyEeoSearchLabels(kind: AshbyEeoKind, info: AshbyProfile): string[] {
  if (info.eeoAnswersEnabled === false) return []
  const value =
    kind === 'gender'
      ? info.gender || ''
      : kind === 'race'
        ? info.raceEthnicity || ''
        : kind === 'veteran'
          ? info.veteranStatus || ''
          : info.disabilityStatus || ''

  // Blank answers stay blank. Explicit decline still searches decline labels.
  if (!value) return []
  if (value === 'decline') {
    return ['Decline to self identify', 'Prefer not to say', "I don't wish to answer"]
  }

  // Display labels Ashby surveys actually render. Match phrases stay looser
  // (see ashbyEeoOptionMatches); these are what we type into a searchable select.
  const search: Record<AshbyEeoKind, Record<string, string[]>> = {
    gender: {
      male: ['Man', 'Male'],
      female: ['Woman', 'Female'],
      non_binary: ['Non-Binary', 'Nonbinary'],
      self_describe: ['Another Gender Identity', 'Self-describe'],
    },
    race: {
      hispanic_or_latino: ['Hispanic or Latino', 'Hispanic'],
      white: ['White'],
      black_or_african_american: ['Black or African American', 'Black'],
      native_hawaiian_or_other_pacific_islander: ['Native Hawaiian or Pacific Islander', 'Pacific Islander'],
      asian: ['Asian or Asian American', 'Asian'],
      american_indian_or_alaska_native: ['American Indian or Alaska Native', 'American Indian'],
      two_or_more_races: ['Two or more races', 'Two or More Races'],
    },
    veteran: {
      veteran: ['I identify as one or more of the classifications of a protected veteran', 'I am a veteran'],
      not_a_veteran: ['I am not a protected veteran', 'I am not a veteran'],
    },
    disability: {
      yes: ['Yes, I have a disability, or have had one in the past', 'Yes, I have a disability'],
      no: ['No, I do not have a disability and have not had one in the past', 'No, I do not have a disability'],
      previously: ['Yes, I have a disability, or have had one in the past', 'I had a disability previously'],
    },
  }
  return search[kind][value] ? [...search[kind][value]] : []
}

function isNameTitle(title: string): boolean {
  const normalized = normalizeAshbyLabel(title)
  if (!normalized) return false
  if (
    normalized.includes('company') ||
    normalized.includes('school') ||
    normalized.includes('employer') ||
    normalized.includes('username') ||
    normalized.includes('reference') ||
    normalized.includes('emergency') ||
    normalized.includes('preferred')
  ) {
    return false
  }
  return (
    normalized === 'name' ||
    normalized.includes('fullname') ||
    normalized.includes('legalname') ||
    normalized.includes('yourname') ||
    normalized.includes('candidatename')
  )
}

// Hosted apply forms put the resume on `_systemfield_resume` (a hidden file input
// inside the dropzone). Cover letters and other uploads are separate file fields.
// The profile mirror stores resumeFileName only, so callers must not invent a file.
export function isAshbyResumeField(target: AshbyTextTarget): boolean {
  if ((target.path || '') === '_systemfield_resume') return true
  const type = (target.type || '').toLowerCase()
  if (type !== 'file') return false
  const title = normalizeAshbyLabel(target.title)
  return title === 'resume' || title === 'cv' || title === 'curriculumvitae'
}

// Standard text/tel/email/url inputs. Empty string means the field is ours but
// the profile has nothing to write. null means another handler (or the default
// matcher) should look at it.
export function ashbyTextValue(target: AshbyTextTarget, info: AshbyProfile): string | null {
  const path = target.path || ''
  const title = target.title || ''
  const id = target.id || ''
  const type = (target.type || '').toLowerCase()
  const normalizedTitle = normalizeAshbyLabel(title)

  if (type === 'file' || path === '_systemfield_resume') return null

  const educationText = ashbyEducationTextValue(id, info)
  if (id.endsWith('-degree') || id.endsWith('-major')) return educationText

  if (path === '_systemfield_name' || isNameTitle(title)) return ashbyFullName(info)

  if (path === '_systemfield_email' || type === 'email' || normalizedTitle === 'email' || normalizedTitle === 'emailaddress') {
    return (info.email || '').trim()
  }

  const normalizedPath = normalizeAshbyLabel(path)
  const phoneTitle =
    type === 'tel' ||
    normalizedPath === 'phone' ||
    normalizedTitle === 'phone' ||
    normalizedTitle === 'mobile' ||
    normalizedTitle === 'mobilephone' ||
    normalizedTitle.includes('phonenumber') ||
    normalizedTitle.includes('mobilenumber') ||
    normalizedTitle.includes('cellphone')
  if (phoneTitle) return ashbyPhoneValue(info)

  if (normalizedTitle.includes('linkedin')) return (info.linkedin || '').trim()

  if (isAshbyLocationField(path, title) && type !== 'file') {
    return ashbyLocationText(info)
  }
  if (normalizedTitle.includes('github')) return (info.github || '').trim()
  if (
    !normalizedTitle.includes('linkedin') &&
    (normalizedTitle.includes('website') ||
      normalizedTitle.includes('portfolio') ||
      normalizedTitle === 'url')
  ) {
    return (info.website || '').trim()
  }

  // Hosted apply forms do not render a repeatable employment section.
  // A single company or title question maps to the first role. Render asks
  // "Current or Most Recent Company" and "Current or Most Recent Title".
  const companyQuestion =
    normalizedTitle === 'employer' ||
    normalizedTitle === 'company' ||
    normalizedTitle === 'companyname' ||
    normalizedTitle === 'lastcompany' ||
    ((normalizedTitle.includes('company') || normalizedTitle.includes('employer')) &&
      (normalizedTitle.includes('current') ||
        normalizedTitle.includes('recent') ||
        normalizedTitle.includes('last')))
  if (companyQuestion && !normalizedTitle.includes('companysize')) {
    return (info.experience?.[0]?.companyName || '').trim()
  }

  const titleQuestion =
    normalizedTitle.includes('jobtitle') ||
    normalizedTitle.includes('currenttitle') ||
    normalizedTitle.includes('currentrole') ||
    normalizedTitle.includes('recenttitle') ||
    normalizedTitle === 'positiontitle' ||
    normalizedTitle === 'title'
  if (titleQuestion) {
    return (info.experience?.[0]?.jobTitle || '').trim()
  }

  return null
}
