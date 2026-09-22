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

// Profile country values are snake_case select keys ("united_states"). Greenhouse
// dropdowns use the display label, often with a dialing code appended ("United States +1").
const COUNTRY_LABELS: Record<string, string> = {
  united_states: 'United States',
  us: 'United States',
  usa: 'United States',
  canada: 'Canada',
  united_kingdom: 'United Kingdom',
  uk: 'United Kingdom',
  great_britain: 'United Kingdom',
}

function unique(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed.toLowerCase())) continue
    seen.add(trimmed.toLowerCase())
    result.push(trimmed)
  }
  return result
}

export function countrySearchValues(country?: string): string[] {
  if (!country?.trim()) return []
  const key = country.trim().toLowerCase().replace(/[\s-]+/g, '_')
  const label = COUNTRY_LABELS[key] || country.replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
  return label ? [label] : []
}

export function stateSearchValues(state?: string): string[] {
  if (!state?.trim()) return []
  const label = state.replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
  return label ? [label] : []
}

// City typeahead (candidate-location) is backed by a geocoder. "City, State" hits
// more often than a single comma-joined string that still has snake_case in it.
export function locationSearchValues(parts: {
  city?: string
  state?: string
  country?: string
}): string[] {
  const city = parts.city?.trim() || ''
  const state = parts.state?.trim() || ''
  const country = parts.country?.trim() || ''
  const queries: string[] = []
  if (city && state) queries.push(`${city}, ${state}`)
  if (city && state && country) queries.push(`${city}, ${state}, ${country}`)
  if (city) queries.push(city)
  if (state && country) queries.push(`${state}, ${country}`)
  else if (state) queries.push(state)
  return unique(queries)
}

// Greenhouse degree options are a short fixed list ("Bachelor's Degree"), not the
// free-text degree string parsed off a resume ("Bachelor of Science", "B.S.").
export function degreeSearchValues(degreeType?: string): string[] {
  if (!degreeType?.trim()) return []
  const degree = degreeType.toLowerCase()

  if (/ph\.?\s?d|doctor of philosophy/.test(degree)) {
    return unique(['Doctor of Philosophy (Ph.D.)', 'Ph.D.', 'Doctorate', degreeType])
  }
  if (/doctor of medicine|\bm\.?\s?d\.?\b/.test(degree)) {
    return unique(['Doctor of Medicine (M.D.)', degreeType])
  }
  if (/juris|\bj\.?\s?d\.?\b/.test(degree)) {
    return unique(['Juris Doctor (J.D.)', degreeType])
  }
  if (/mba|m\.b\.a|business administration/.test(degree)) {
    return unique(['Master of Business Administration (M.B.A.)', "Master's Degree", degreeType])
  }
  if (/master|m\.s\b|m\.sc|msc\b/.test(degree)) {
    return unique(["Master's Degree", 'Master', degreeType])
  }
  if (/bachelor|b\.s\b|b\.a\b|bsc\b|\bbs\b|\bba\b/.test(degree)) {
    return unique(["Bachelor's Degree", 'Bachelor', degreeType])
  }
  if (/associate|\ba\.a\b|\ba\.s\b/.test(degree)) {
    return unique(["Associate's Degree", 'Associate', degreeType])
  }
  if (/high school|secondary school|\bged\b/.test(degree)) {
    return unique(['High School', degreeType])
  }
  return [degreeType.trim()]
}

// Greenhouse's discipline catalog is a short fixed list (no "Electrical Engineering").
// Abbreviations must search that label. A later raw "EE" / "CS" query is only a fallback;
// the picker rejects substring accidents such as "EE" → Speech or "CS" → Physics.
const DISCIPLINE_ALIASES: Record<string, string> = {
  cs: 'Computer Science',
  'comp sci': 'Computer Science',
  'computer sci': 'Computer Science',
  'computer science': 'Computer Science',
  ee: 'Engineering',
  ece: 'Engineering',
  me: 'Engineering',
  'electrical engineering': 'Engineering',
  'computer engineering': 'Engineering',
  'mechanical engineering': 'Engineering',
  math: 'Mathematics',
  maths: 'Mathematics',
  statistics: 'Statistics & Decision Theory',
  stats: 'Statistics & Decision Theory',
}

export function disciplineSearchValues(major?: string): string[] {
  if (!major?.trim()) return []
  const trimmed = major.trim()
  const stripped = trimmed
    .replace(
      /^(b\.?s\.?|b\.?a\.?|m\.?s\.?|bachelor of science in|bachelor of arts in|master of science in)\s+/i,
      '',
    )
    .trim()
  const alias =
    DISCIPLINE_ALIASES[stripped.toLowerCase()] || DISCIPLINE_ALIASES[trimmed.toLowerCase()] || ''
  const values = [alias, stripped, trimmed]
  if (/\bengineering\b/i.test(stripped)) values.unshift('Engineering')
  return unique(values)
}

// Resume text rarely matches Greenhouse's school catalog string. "University of Texas at Austin"
// is stored as "University of Texas - Austin"; "MIT" is not a substring of the official name.
// Queries are ordered so the catalog shape is tried before the raw profile string.
const SCHOOL_ALIASES: Record<string, string[]> = {
  mit: ['Massachusetts Institute of Technology'],
  ucla: ['University of California - Los Angeles'],
  'uc berkeley': ['University of California - Berkeley'],
  ucb: ['University of California - Berkeley'],
  nyu: ['New York University'],
  cmu: ['Carnegie Mellon University'],
  'carnegie mellon': ['Carnegie Mellon University'],
  caltech: ['California Institute of Technology'],
  'cal tech': ['California Institute of Technology'],
  'georgia tech': ['Georgia Institute of Technology'],
  gatech: ['Georgia Institute of Technology'],
  uiuc: ['University of Illinois - Urbana-Champaign'],
  usc: ['University of Southern California'],
  upenn: ['University of Pennsylvania'],
  'ut austin': ['University of Texas - Austin'],
  'university of texas at austin': ['University of Texas - Austin'],
}

export function schoolSearchValues(schoolName?: string): string[] {
  if (!schoolName?.trim()) return []
  const trimmed = schoolName.trim()
  const simplified = trimmed.replace(/[.]/g, '').replace(/\s+/g, ' ').trim()
  const expandedUniv = simplified.replace(/\buniv\b/i, 'University')
  const alias = SCHOOL_ALIASES[schoolAliasKey(trimmed)] || SCHOOL_ALIASES[schoolAliasKey(simplified)]
  const seeds = [...(alias || []), trimmed, simplified, expandedUniv]
  const queries: string[] = []
  for (const seed of seeds) {
    queries.push(...campusRewrites(seed), seed)
  }
  const paren = trimmed.match(/^(.*?)\s*\(([^)]+)\)\s*$/)
  if (paren) queries.push(paren[1].trim(), paren[2].trim())
  return unique(queries)
}

function schoolAliasKey(value: string): string {
  return value.toLowerCase().replace(/[.]/g, '').replace(/\s+/g, ' ').trim()
}

function campusRewrites(value: string): string[] {
  const rewrites: string[] = []
  const paren = value.match(/^(.*?)\s*\(([^)]+)\)\s*$/)
  if (paren) {
    const base = paren[1].trim()
    const inner = paren[2].trim()
    if (base && inner) rewrites.push(`${base} - ${inner}`, `${base} ${inner}`)
  }
  if (value.includes(',')) {
    rewrites.push(value.replace(/,/g, ' - ').replace(/\s+/g, ' ').trim())
    rewrites.push(value.replace(/,/g, ' ').replace(/\s+/g, ' ').trim())
  }
  if (/\bat\b/i.test(value)) {
    rewrites.push(value.replace(/\s+\bat\b\s+/i, ' - ').replace(/\s+/g, ' ').trim())
  }
  return rewrites
}

// Particles that Greenhouse inserts or drops ("at" vs "-"). Institution words stay
// significant so "Columbia University" does not collapse into "Columbia College".
const SCHOOL_GLUE_TOKENS = new Set(['of', 'the', 'and', 'at', 'for', 'de', 'la', 'le'])
const SCHOOL_INSTITUTION_TOKENS = new Set([
  'university',
  'college',
  'institute',
  'institution',
  'school',
])

// Whole-token match against the profile name and its catalog queries.
// Greenhouse's school menu opens on the A-page (Alverno College is on that page) and
// substring search ranks "MIT" → Mitchell, "Tech" → Ecole Polytechnique, "Berkeley" → Berkeley College.
export function pickSchoolOption(optionTexts: string[], targets: string[]): string | null {
  const wanted = targets.map((target) => target.trim()).filter(Boolean)
  if (wanted.length === 0) return null
  let best: { text: string; score: number } | null = null
  for (const raw of optionTexts) {
    const text = raw.replace(/\s+/g, ' ').trim()
    if (!text) continue
    let score = 0
    for (const target of wanted) score = Math.max(score, scoreSchool(text, target))
    if (score < 50) continue
    if (!best || score > best.score) best = { text, score }
  }
  return best?.text ?? null
}

function scoreSchool(option: string, target: string): number {
  const optionNorm = normalizeSchool(option)
  const targetNorm = normalizeSchool(target)
  if (!optionNorm || !targetNorm) return 0
  if (optionNorm === targetNorm) return 1000

  const optionTokens = schoolTokens(optionNorm)
  const targetTokens = schoolTokens(targetNorm)
  if (optionTokens.length === 0 || targetTokens.length === 0) return 0
  if (optionTokens.join(' ') === targetTokens.join(' ')) return 900
  if (!targetTokens.every((token) => optionTokens.includes(token))) return 0
  const extras = optionTokens.filter((token) => !targetTokens.includes(token))
  // "Harvard" may land on "Harvard University". A different place word
  // ("Bloomsburg", "California", "Alverno") is not an acceptable extra.
  if (extras.some((token) => !SCHOOL_INSTITUTION_TOKENS.has(token))) return 0
  return 100 + targetTokens.length * 10
}

function schoolTokens(normalized: string): string[] {
  return normalized.split(' ').filter((token) => token.length > 1 && !SCHOOL_GLUE_TOKENS.has(token))
}

function normalizeSchool(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[.'’",()]/g, ' ')
    .replace(/[-–—/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Degree and discipline options are a fixed catalog. Exact label, then a whole-token
// prefix ("Statistics" → "Statistics & Decision Theory"). Never a raw substring.
export function pickDegreeOption(optionTexts: string[], candidates: string[]): string | null {
  return pickGreenhouseCatalogOption(optionTexts, candidates)
}

export function pickDisciplineOption(optionTexts: string[], candidates: string[]): string | null {
  return pickGreenhouseCatalogOption(optionTexts, candidates)
}

export function pickMonthOption(optionTexts: string[], month: string): string | null {
  return pickGreenhouseCatalogOption(optionTexts, [month])
}

function pickGreenhouseCatalogOption(optionTexts: string[], candidates: string[]): string | null {
  const cleaned = optionTexts.map((text) => text.replace(/\s+/g, ' ').trim()).filter(Boolean)
  for (const candidate of candidates) {
    const want = candidate.trim().toLowerCase()
    if (!want) continue
    const exact = cleaned.find((text) => text.toLowerCase() === want)
    if (exact) return exact
  }
  for (const candidate of candidates) {
    const want = normalizeSchool(candidate)
    if (want.length < 4) continue
    const hit = cleaned.find((text) => normalizeSchool(text).startsWith(`${want} `))
    if (hit) return hit
  }
  return null
}

export type GreenhouseEducationKind =
  | 'school'
  | 'degree'
  | 'discipline'
  | 'start-month'
  | 'end-month'
  | 'start-year'
  | 'end-year'

export type GreenhouseEducationField = {
  index: number
  kind: GreenhouseEducationKind
}

const EDUCATION_KIND_BY_ID: Record<string, GreenhouseEducationKind> = {
  school: 'school',
  degree: 'degree',
  discipline: 'discipline',
  'start-month': 'start-month',
  'end-month': 'end-month',
  'start-year': 'start-year',
  'end-year': 'end-year',
}

// Job-boards education ids are `${kind}--${key}` (double dash). Employment ids are
// single-dash (`company-name-0`, `start-date-month-0`) and must not match here.
export function parseGreenhouseEducationId(
  inputId: string | null | undefined,
): GreenhouseEducationField | null {
  if (!inputId) return null
  const match = inputId.match(
    /^(school|degree|discipline|start-month|end-month|start-year|end-year)--(\d+)$/,
  )
  if (!match) return null
  const kind = EDUCATION_KIND_BY_ID[match[1]]
  if (!kind) return null
  return { index: Number(match[2]), kind }
}

export function greenhouseEducationRowsToAdd(existingRows: number, profileEntries: number): number {
  if (profileEntries <= 1 || existingRows >= profileEntries) return 0
  const existing = Math.max(0, existingRows)
  return Math.min(profileEntries, 8) - Math.min(existing, profileEntries)
}

const MONTH_ABBREV: Record<string, string> = {
  jan: 'January',
  feb: 'February',
  mar: 'March',
  apr: 'April',
  may: 'May',
  jun: 'June',
  jul: 'July',
  aug: 'August',
  sep: 'September',
  sept: 'September',
  oct: 'October',
  nov: 'November',
  dec: 'December',
}

export function monthNameFromLooseDate(value?: string): string | null {
  if (!value?.trim()) return null
  const yearFirst = value.match(/\b(?:19|20)\d{2}[-/.](\d{1,2})\b/)
  if (yearFirst) {
    const index = Number(yearFirst[1]) - 1
    if (index >= 0 && index < 12) return MONTHS[index]
  }
  const monthFirst = value.match(/\b(\d{1,2})[-/](?:19|20)\d{2}\b/)
  if (monthFirst) {
    const index = Number(monthFirst[1]) - 1
    if (index >= 0 && index < 12) return MONTHS[index]
  }
  for (const month of MONTHS) {
    if (new RegExp(`\\b${month}\\b`, 'i').test(value)) return month
  }
  const abbrev = value.toLowerCase().match(/\b(sept|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/)
  if (!abbrev) return null
  return MONTH_ABBREV[abbrev[1]] ?? null
}

export function yearFromLooseDate(value?: string): string | null {
  const match = value?.match(/\b((?:19|20)\d{2})\b/)
  return match ? match[1] : null
}

// #country inside the phone fieldset is the dialing-code combobox, not residence.
// Residence country is a separate custom question (or candidate-location).
export function isResidenceCountryField(id: string, fieldText: string): boolean {
  if (id === 'country' || id === 'candidate-location') return false
  if (!fieldText.includes('country') || fieldText.includes('countryside')) return false
  if (fieldText.includes('sponsor') || fieldText.includes('phone')) return false
  return (
    id.startsWith('question_') ||
    fieldText.includes('resid') ||
    fieldText.includes('located') ||
    fieldText.includes('location')
  )
}

export function isStateQuestion(fieldText: string): boolean {
  if (
    fieldText.includes('statement') ||
    fieldText.includes('estate') ||
    fieldText.includes('unitedstates')
  ) {
    return false
  }
  return (
    fieldText.includes('selectyourstate') ||
    fieldText.includes('stateofresidence') ||
    fieldText.includes('whichstate') ||
    fieldText.includes('yourstate') ||
    (fieldText.includes('province') && !fieldText.includes('provincial'))
  )
}

// Profile editor values (UpdateOtherInfoDialog). work_visa is "authorized now,
// sponsorship later" — legally authorized, and sponsorship yes unless overridden.
const AUTHORIZED_TO_WORK = new Set([
  'us_citizen',
  'green_card',
  'work_visa',
  'authorized_no_sponsorship',
])

const NO_SPONSORSHIP_STATUSES = new Set([
  'us_citizen',
  'green_card',
  'authorized_no_sponsorship',
])

export function isAuthorizedToWork(workAuthorization?: string): boolean {
  return AUTHORIZED_TO_WORK.has(workAuthorization ?? '')
}

// sponsorshipRequired ('Yes' / 'No') wins. When it is unset, infer from status.
export function profileRequiresSponsorship(info: {
  workAuthorization?: string
  sponsorshipRequired?: string
}): boolean {
  if (info.sponsorshipRequired) return info.sponsorshipRequired === 'Yes'
  return !NO_SPONSORSHIP_STATUSES.has(info.workAuthorization ?? '')
}

// Typed into react-select only if the open menu has no matching option yet.
// "Yes" alone hides SpaceX's sentence options ("…for any employer"), which do
// not contain the word Yes. The sentence query is the first attempt; Yes/No is
// the fallback for boards whose menu is literally Yes and No.
export function workAuthorizationSearchValues(workAuthorization?: string): string[] {
  if (workAuthorization === 'work_visa') return ['present employer', 'Yes']
  if (isAuthorizedToWork(workAuthorization)) return ['any employer', 'Yes']
  return ['No', 'not authorized']
}

export function sponsorshipSearchValues(requiresSponsorship: boolean): string[] {
  return requiresSponsorship ? ['Yes', 'require sponsorship'] : ['No', 'not require']
}

type RankedOption = { raw: string; n: string }

function normalizeOption(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function rankOptions(optionTexts: string[]): RankedOption[] {
  return optionTexts
    .map((text) => ({ raw: text, n: normalizeOption(text) }))
    .filter((option) => option.n.length > 0)
}

function isNotAuthorized(n: string): boolean {
  return n.includes('not authorized') || n.includes('not authorised') || n.includes('unauthorized')
}

function isPresentEmployerOnly(n: string): boolean {
  return n.includes('present employer') || n.includes('current employer only')
}

function isAnyEmployer(n: string): boolean {
  return n.includes('any employer') && !isNotAuthorized(n)
}

function isUnknownStatus(n: string): boolean {
  return n.includes('unknown')
}

function mentionsSponsorship(n: string): boolean {
  return n.includes('sponsor')
}

// Unrestricted authorization: legally allowed to work, not tied to the current
// employer, and not a sponsorship or "unknown" answer.
function isUnrestrictedAuthorized(n: string): boolean {
  const authorized =
    n.includes('authorized to work') ||
    n.includes('authorised to work') ||
    n.includes('legally authorized') ||
    n.includes('legally authorised')
  return (
    authorized &&
    !isNotAuthorized(n) &&
    !isPresentEmployerOnly(n) &&
    !mentionsSponsorship(n) &&
    !isUnknownStatus(n)
  )
}

function affirmsSponsorship(n: string): boolean {
  if (deniesSponsorship(n)) return false
  if (n === 'yes' || n.startsWith('yes ')) return true
  return (
    n.includes('require sponsorship') ||
    n.includes('requires sponsorship') ||
    n.includes('need sponsorship') ||
    n.includes('needs sponsorship')
  )
}

function deniesSponsorship(n: string): boolean {
  if (n === 'no' || n.startsWith('no ')) return true
  if (n.startsWith('yes')) return false
  return (
    n.includes('not require') ||
    n.includes('not need') ||
    n.includes('no sponsorship') ||
    n.includes('without sponsorship')
  )
}

// Returns the option label to click, or null when none of the visible labels fit.
// Exact Yes/No wins. Sentence menus (no Yes/No) use the authorization wording.
export function pickWorkAuthorizationOption(
  optionTexts: string[],
  workAuthorization?: string,
): string | null {
  if (!workAuthorization) return null
  const options = rankOptions(optionTexts)
  if (!isAuthorizedToWork(workAuthorization)) {
    return (
      options.find((option) => option.n === 'no')?.raw ||
      options.find((option) => isNotAuthorized(option.n))?.raw ||
      options.find((option) => affirmsSponsorship(option.n) && !isNotAuthorized(option.n))?.raw ||
      null
    )
  }

  // "Authorized, sponsorship needed later" maps to the present-employer sentence
  // when that choice exists. A Yes/No menu still gets Yes (sponsorship is separate).
  if (workAuthorization === 'work_visa') {
    const presentOnly = options.find((option) => isPresentEmployerOnly(option.n))
    if (presentOnly) return presentOnly.raw
  }

  return (
    options.find((option) => option.n === 'yes')?.raw ||
    options.find((option) => isAnyEmployer(option.n))?.raw ||
    options.find((option) => isUnrestrictedAuthorized(option.n))?.raw ||
    null
  )
}

export function pickSponsorshipOption(
  optionTexts: string[],
  requiresSponsorship: boolean,
): string | null {
  const options = rankOptions(optionTexts)
  if (requiresSponsorship) {
    return (
      options.find((option) => option.n === 'yes')?.raw ||
      options.find((option) => affirmsSponsorship(option.n))?.raw ||
      null
    )
  }
  return (
    options.find((option) => option.n === 'no')?.raw ||
    options.find((option) => deniesSponsorship(option.n))?.raw ||
    null
  )
}
