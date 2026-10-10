// Pure mapping from the resume API's parsed shape to the app's ParsedResumeData. No
// supabase import, so node:test and the profile row mapper can load it.
import { canadaProvinces, ukRegions, usStates } from '../utils/locationLists.ts'
import type { Education, Experience, ParsedResumeData } from '../types/index.ts'

// ---------------------------------------------------------------------------
// Response normalization
//
// The API is all snake_case and enveloped: { success, data: { first_upload, storage_path,
// parsed }, error, request_id, timestamp }. This takes `data.parsed` (the object, or null on
// a repeat upload) and maps it to the app's PersonalInfo-shaped ParsedResumeData:
//   parsed.name                  "Jane Doe"
//   parsed.contact               { name, email, phone, location, linkedin, website }
//   parsed.summary               (unused here)
//   parsed.work_history[]        { company, title, location?, start_date?, end_date?,
//                                  current?, description?, bullets?[] }
//   parsed.education[]           { institution, degree?, field?, start_date?, end_date?, gpa? }
//   parsed.skills[]              string[]
//   parsed.certifications[]      (unused here)
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v))

export function normalizeParsedResume(parsed: any): ParsedResumeData {
  if (!parsed || typeof parsed !== 'object') return {}

  const contact = parsed.contact ?? {}
  const out: ParsedResumeData = {}

  const fullName = str(parsed.name) || str(contact.name) || str(parsed.full_name)
  if (fullName) {
    const { first, middle, last } = splitName(fullName)
    if (first) out.firstName = first
    if (middle) out.middleName = middle
    if (last) out.lastName = last
  }

  if (str(contact.email)) out.email = str(contact.email)
  if (str(contact.phone)) {
    const phone = splitPhone(str(contact.phone))
    out.phone = phone.national
    if (phone.countryCode) out.phoneCountryCode = phone.countryCode
  }
  if (str(contact.linkedin)) out.linkedin = normalizeLinkedin(str(contact.linkedin))
  if (str(contact.website)) out.website = normalizeUrl(str(contact.website))
  const github = findGithub(parsed, contact)
  if (github) out.github = github

  // The API normalizes address parts onto contact; fall back to the raw location string.
  if (str(contact.location)) {
    const { city, state } = splitLocation(str(contact.location))
    if (city) out.city = city
    if (state) out.state = state
  }
  if (str(contact.address)) out.address = str(contact.address)
  if (str(contact.address_line_2)) out.addressLine2 = str(contact.address_line_2)
  if (str(contact.city)) out.city = str(contact.city)
  if (str(contact.state)) out.state = str(contact.state)
  if (str(contact.zip)) out.zip = str(contact.zip)
  if (str(contact.country)) out.country = str(contact.country)

  // The profile selects hold canonical values: state is the full name ("Pennsylvania") and
  // country is united_states / canada / united_kingdom. A parsed "PA" or "USA" left both
  // blank, so Country and the Greenhouse dropdowns that read it stayed unselected.
  const place = canonicalPlace(out.state, out.country)
  if (place.state) out.state = place.state
  else delete out.state
  if (place.country) out.country = place.country
  else delete out.country

  out.experience = (Array.isArray(parsed.work_history) ? parsed.work_history : []).map(toExperience)
  out.education = (Array.isArray(parsed.education) ? parsed.education : []).map(toEducation)
  out.skills = (Array.isArray(parsed.skills) ? parsed.skills : []).filter(
    (s: unknown): s is string => typeof s === 'string' && s.trim() !== '',
  )

  return out
}

function toExperience(r: any): Omit<Experience, 'id'> {
  const bullets = Array.isArray(r?.bullets)
    ? r.bullets.filter((b: unknown) => typeof b === 'string')
    : []
  const split = splitLocation(str(r?.location))
  const city = str(r?.location_city) || split.city
  const state = str(r?.location_state) || split.state
  return {
    companyName: str(r?.company),
    jobTitle: str(r?.title),
    startDate: toMonthInput(str(r?.start_date)),
    endDate: r?.current ? '' : toMonthInput(str(r?.end_date)),
    present: Boolean(r?.current),
    description: str(r?.description) || bullets.join('\n'),
    locationCity: city,
    locationState: state,
  }
}

function toEducation(r: any): Omit<Education, 'id'> {
  return {
    schoolName: str(r?.institution),
    degreeType: canonicalDegree(str(r?.degree) || str(r?.degree_raw)),
    major: str(r?.field),
    startYear: yearOf(str(r?.start_date)),
    graduationYear: yearOf(str(r?.end_date) || str(r?.graduation_date) || str(r?.date) || str(r?.year)),
    gpa: str(r?.gpa) || undefined,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// "+1 (215) 555-0100", "215.555.0100", "+44 20 7946 0958" -> national digits formatted the way
// the Personal details field formats them, plus the dial code the dropdown supports.
export function splitPhone(raw: string): { national: string; countryCode: string } {
  const trimmed = raw.trim()
  let digits = trimmed.replace(/\D/g, '')
  let countryCode = ''
  if (trimmed.startsWith('+44') || (digits.startsWith('44') && digits.length > 10 && trimmed.startsWith('+'))) {
    countryCode = '+44'
    digits = digits.replace(/^44/, '').replace(/^0/, '')
    return { national: digits, countryCode }
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    digits = digits.slice(1)
    countryCode = '+1'
  } else if (trimmed.startsWith('+1')) {
    digits = digits.replace(/^1/, '')
    countryCode = '+1'
  }
  digits = digits.slice(0, 10)
  // Only a full 10-digit number is reformatted; anything shorter is kept as written.
  const national =
    digits.length === 10
      ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
      : trimmed.replace(/^\+?1[\s.-]+/, '')
  return { national, countryCode }
}

// The API only extracts linkedin and website. A GitHub link usually lands in website, or only
// appears in the free text, so look there before giving up.
export function findGithub(parsed: any, contact: any): string {
  const direct = str(contact?.github) || str(parsed?.github)
  if (direct) return normalizeUrl(direct)
  const pool: string[] = [str(contact?.website), str(contact?.linkedin), str(parsed?.summary)]
  for (const job of Array.isArray(parsed?.work_history) ? parsed.work_history : []) {
    pool.push(str(job?.description), ...(Array.isArray(job?.bullets) ? job.bullets.map(str) : []))
  }
  const match = /(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})(?:\/[\w.-]+)?/i.exec(
    pool.join(' '),
  )
  return match ? normalizeUrl(match[0]) : ''
}

const DEGREE_RULES: Array<{ value: string; phrases: string[]; codes: string[] }> = [
  { value: 'phd', phrases: ['ph d', 'doctor', 'doctoral'], codes: ['phd', 'scd', 'edd', 'dba'] },
  {
    value: 'masters',
    phrases: ['master'],
    codes: ['ma', 'ms', 'msc', 'mba', 'meng', 'mfa', 'mph', 'mtech', 'llm', 'msw', 'mpa', 'mis'],
  },
  {
    value: 'bachelors',
    phrases: ['bachelor', 'undergraduate degree', 'b eng', 'b tech'],
    codes: ['ba', 'bs', 'bsc', 'beng', 'btech', 'bfa', 'ab', 'bba', 'bsba', 'bse', 'bbs', 'bsn', 'bcom', 'bcs'],
  },
  { value: 'associates', phrases: ['associate'], codes: ['aa', 'as', 'aas', 'aba'] },
  { value: 'high_school_diploma', phrases: ['high school', 'secondary school', 'hs diploma'], codes: ['ged'] },
  { value: 'bootcamp', phrases: ['bootcamp', 'boot camp'], codes: [] },
  { value: 'certificate', phrases: ['certificate', 'certification', 'nanodegree'], codes: [] },
]
const DEGREE_VALUES = new Set(DEGREE_RULES.map((r) => r.value))

// Free-text degree ("BBA", "B.S. in Finance", "Bachelor of Business Administration") -> the
// value the Degree select uses; '' when it cannot be placed (the select then shows its prompt).
export function canonicalDegree(raw: string): string {
  const text = raw.trim().toLowerCase()
  if (!text) return ''
  if (DEGREE_VALUES.has(text)) return text
  const cleaned = text
    .replace(/[.,/\\()'"-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const tokens = cleaned.split(' ')
  // "b s" / "b b a" style: merge runs of single letters.
  const merged: string[] = []
  let run = ''
  for (const t of tokens) {
    if (t.length === 1 && /^[a-z]$/.test(t)) run += t
    else {
      if (run) merged.push(run)
      run = ''
      merged.push(t)
    }
  }
  if (run) merged.push(run)
  const first = merged[0] ?? ''
  const last = merged[merged.length - 1] ?? ''
  for (const rule of DEGREE_RULES) {
    if (rule.phrases.some((p) => cleaned.includes(p))) return rule.value
    if (rule.codes.includes(first) || rule.codes.includes(last)) return rule.value
  }
  return ''
}

const US_ABBR: Record<string, string> = Object.fromEntries(
  `AL Alabama,AK Alaska,AZ Arizona,AR Arkansas,CA California,CO Colorado,CT Connecticut,DE Delaware,FL Florida,GA Georgia,HI Hawaii,ID Idaho,IL Illinois,IN Indiana,IA Iowa,KS Kansas,KY Kentucky,LA Louisiana,ME Maine,MD Maryland,MA Massachusetts,MI Michigan,MN Minnesota,MS Mississippi,MO Missouri,MT Montana,NE Nebraska,NV Nevada,NH New Hampshire,NJ New Jersey,NM New Mexico,NY New York,NC North Carolina,ND North Dakota,OH Ohio,OK Oklahoma,OR Oregon,PA Pennsylvania,RI Rhode Island,SC South Carolina,SD South Dakota,TN Tennessee,TX Texas,UT Utah,VT Vermont,VA Virginia,WA Washington,WV West Virginia,WI Wisconsin,WY Wyoming,DC District of Columbia`
    .split(',')
    .map((pair) => {
      const i = pair.indexOf(' ')
      return [pair.slice(0, i), pair.slice(i + 1)]
    }),
)

const COUNTRY_ALIASES: Record<string, string> = {
  'united states': 'united_states',
  'united states of america': 'united_states',
  usa: 'united_states',
  us: 'united_states',
  canada: 'canada',
  'united kingdom': 'united_kingdom',
  uk: 'united_kingdom',
  'great britain': 'united_kingdom',
  england: 'united_kingdom',
}

export function canonicalPlace(
  state: string | undefined,
  country: string | undefined,
): { state: string; country: string } {
  const rawState = (state ?? '').trim()
  const rawCountry = (country ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ')
  let countryValue = COUNTRY_ALIASES[rawCountry] ?? ''
  let stateValue = ''
  if (rawState) {
    const abbr = US_ABBR[rawState.toUpperCase()]
    const lists: Array<[string, { label: string; value: string }[]]> = [
      ['united_states', usStates],
      ['canada', canadaProvinces],
      ['united_kingdom', ukRegions],
    ]
    const wanted = rawState.toLowerCase().replace(/_/g, ' ')
    for (const [key, list] of lists) {
      if (countryValue && key !== countryValue) continue
      const hit = list.find(
        (o) =>
          o.label.toLowerCase() === wanted ||
          o.value.toLowerCase().replace(/_/g, ' ') === wanted ||
          (abbr && key === 'united_states' && o.label === abbr),
      )
      if (hit) {
        stateValue = hit.value
        if (!countryValue) countryValue = key
        break
      }
    }
  }
  return { state: stateValue, country: countryValue }
}

export function splitName(full: string): { first: string; middle: string; last: string } {
  const parts = full.split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return { first: parts[0] ?? '', middle: '', last: '' }
  if (parts.length === 2) return { first: parts[0], middle: '', last: parts[1] }
  return { first: parts[0], middle: parts.slice(1, -1).join(' '), last: parts[parts.length - 1] }
}

// "Austin, TX" -> { city: "Austin", state: "TX" }. Single token -> city only.
function splitLocation(location: string): { city: string; state: string } {
  if (!location) return { city: '', state: '' }
  const idx = location.lastIndexOf(',')
  if (idx === -1) return { city: location, state: '' }
  return { city: location.slice(0, idx).trim(), state: location.slice(idx + 1).trim() }
}

// The experience dialog uses <input type="month"> — normalize to "YYYY-MM" (a bare year
// becomes January). Unparseable values are dropped rather than fed to the input / date sync.
function toMonthInput(value: string): string {
  if (!value) return ''
  if (/^\d{4}-\d{2}$/.test(value)) return value
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(0, 7)
  if (/^\d{4}$/.test(value)) return `${value}-01`
  const d = new Date(value)
  if (!Number.isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }
  return ''
}

// Education year fields are free text — keep just the year when we can find one.
function yearOf(value: string): string {
  const match = /(\d{4})/.exec(value)
  return match ? match[1] : value
}

function normalizeUrl(value: string): string {
  if (!value) return ''
  return /^https?:\/\//i.test(value) ? value : `https://${value.replace(/^\/+/, '')}`
}

function normalizeLinkedin(value: string): string {
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value
  if (/^(www\.)?linkedin\.com/i.test(value)) return `https://${value}`
  return `https://linkedin.com/${value.replace(/^\/+/, '')}`
}
