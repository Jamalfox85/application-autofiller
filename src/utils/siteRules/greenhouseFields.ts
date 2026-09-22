import { canadaProvinces, ukRegions, usStates } from '../locationLists.ts'

// Greenhouse's #country control is the phone dialing-code react-select. Option labels look
// like "United States +1" (country name, space, plus, calling code). It is not the
// country-of-residence custom question, which uses a question_* id.

export type DialingCodeTarget = {
  label: string
  dialCode: '+1' | '+44'
}

type ResidenceKey = 'united_states' | 'canada' | 'united_kingdom'

const DIALING_CODE_BY_RESIDENCE: Record<ResidenceKey, DialingCodeTarget> = {
  united_states: { label: 'United States', dialCode: '+1' },
  canada: { label: 'Canada', dialCode: '+1' },
  united_kingdom: { label: 'United Kingdom', dialCode: '+44' },
}

const RESIDENCE_ALIASES: Record<ResidenceKey, string[]> = {
  united_states: ['united states', 'united states of america', 'usa', 'us'],
  canada: ['canada'],
  united_kingdom: ['united kingdom', 'uk', 'great britain', 'britain', 'gb'],
}

export type LocationProfile = {
  city?: string | null
  state?: string | null
  country?: string | null
}

export function isGreenhousePhoneDialingCodeField(inputId: string | null | undefined) {
  // question_* country-of-residence dropdowns must not be treated as the dialing code.
  return inputId === 'country'
}

export function phoneDialingCodeTarget(info: {
  country?: string | null
  phoneCountryCode?: string | null
}): DialingCodeTarget | null {
  const code = normalizeDialCode(info.phoneCountryCode)
  const residence = residenceKey(info.country)

  // The calling code decides the field. Residence only disambiguates NANP +1 (US vs Canada).
  // A bare +1 maps to United States, matching the profile editor's default when US and
  // Canada share a code.
  if (code === '+44') return DIALING_CODE_BY_RESIDENCE.united_kingdom
  if (code === '+1') {
    return residence === 'canada'
      ? DIALING_CODE_BY_RESIDENCE.canada
      : DIALING_CODE_BY_RESIDENCE.united_states
  }
  if (residence) return DIALING_CODE_BY_RESIDENCE[residence]
  return null
}

export function dialingCodeSearchValues(target: DialingCodeTarget) {
  // The country name is what Greenhouse's react-select filters on. The full
  // "United States +1" label is a second attempt if the short name doesn't surface.
  return [target.label, `${target.label} ${target.dialCode}`]
}

export function pickDialingCodeOption(optionTexts: string[], target: DialingCodeTarget) {
  const wantName = target.label.toLowerCase()
  for (const raw of optionTexts) {
    const text = collapseWhitespace(raw)
    if (!text) continue
    if (!optionHasDialCode(text, target.dialCode)) continue
    if (dialingOptionCountryName(text) === wantName) return text
  }
  return null
}

export function locationSearchQueries(info: LocationProfile) {
  const city = (info.city || '').trim()
  const state = displayState(info.state, info.country)
  const queries: string[] = []
  // City + state is specific enough for Pelias without appending the country slug.
  // "San Francisco" alone also returns "San Francisco, Cebu, Philippines".
  if (city && state) queries.push(`${city}, ${state}`)
  if (city) queries.push(city)
  else if (state) queries.push(state)
  return queries
}

export function pickLocationOption(optionTexts: string[], info: LocationProfile) {
  const city = (info.city || '').trim()
  const state = displayState(info.state, info.country)
  const residence = residenceKey(info.country)
  const cityNorm = normalizePlace(city)
  const stateNorm = normalizePlace(state)

  let best: { text: string; score: number } | null = null

  for (const raw of optionTexts) {
    const text = collapseWhitespace(raw)
    if (!text) continue
    const parts = text.split(',').map((part) => part.trim()).filter(Boolean)
    if (parts.length === 0) continue

    const countryClass = classifyOptionCountry(parts, residence, stateNorm)
    if (countryClass === 'mismatch') continue

    const first = normalizePlace(parts[0])
    if (cityNorm && first !== cityNorm && !first.includes(cityNorm)) continue

    let score = 0
    if (countryClass === 'match') score += 100
    if (cityNorm && first === cityNorm) score += 40
    else if (cityNorm) score += 5
    if (stateNorm && parts.some((part) => normalizePlace(part) === stateNorm)) score += 20
    if (!residence && score === 0) continue
    if (residence && countryClass !== 'match' && score < 40) continue

    if (!best || score > best.score) best = { text, score }
  }

  return best?.text ?? null
}

function classifyOptionCountry(
  parts: string[],
  residence: ResidenceKey | '',
  stateNorm: string,
): 'match' | 'mismatch' | 'unknown' {
  if (!residence) return 'unknown'
  const last = parts[parts.length - 1] || ''
  if (segmentMatchesResidence(last, residence)) return 'match'

  // Pelias labels rendered by Greenhouse are "City, Region, Country". A last segment
  // that is not the profile country is a different place, even when the city name matches.
  if (parts.length >= 3) return 'mismatch'

  if (parts.length === 2) {
    const lastNorm = normalizePlace(last)
    if (stateNorm && lastNorm === stateNorm) return 'unknown'
    if (matchesSomeOtherResidence(last, residence)) return 'mismatch'
    // A long trailing segment ("Philippines") is a country. Short ones ("CA") are
    // state abbreviations and are not distinguishable from the profile country.
    if (lastNorm.length > 3) return 'mismatch'
  }
  return 'unknown'
}

function segmentMatchesResidence(segment: string, residence: ResidenceKey) {
  const normalized = normalizePlace(segment)
  return RESIDENCE_ALIASES[residence].some((alias) => normalizePlace(alias) === normalized)
}

function matchesSomeOtherResidence(segment: string, residence: ResidenceKey) {
  return (Object.keys(RESIDENCE_ALIASES) as ResidenceKey[]).some(
    (key) => key !== residence && segmentMatchesResidence(segment, key),
  )
}

function residenceKey(country: string | null | undefined): ResidenceKey | '' {
  const normalized = normalizePlace(country || '').replace(/[_-]+/g, ' ')
  if (!normalized) return ''
  const keys = Object.keys(RESIDENCE_ALIASES) as ResidenceKey[]
  return keys.find((key) => RESIDENCE_ALIASES[key].some((alias) => normalizePlace(alias) === normalized)) || ''
}

function displayState(state: string | null | undefined, country: string | null | undefined) {
  const trimmed = (state || '').trim()
  if (!trimmed) return ''
  const residence = residenceKey(country)
  const list =
    residence === 'canada'
      ? canadaProvinces
      : residence === 'united_kingdom'
        ? ukRegions
        : residence === 'united_states'
          ? usStates
          : [...usStates, ...canadaProvinces, ...ukRegions]
  const hit = list.find(
    (option) =>
      option.value.toLowerCase() === trimmed.toLowerCase() ||
      option.label.toLowerCase() === trimmed.toLowerCase(),
  )
  if (hit) return hit.label
  return trimmed.replace(/_/g, ' ')
}

function normalizeDialCode(code: string | null | undefined) {
  const compact = (code || '').replace(/\s+/g, '')
  if (!compact) return ''
  const digits = compact.replace(/^\+/, '')
  if (!/^\d+$/.test(digits)) return ''
  return `+${digits}`
}

function optionHasDialCode(text: string, dialCode: string) {
  return collapseWhitespace(text).replace(/\s+/g, '').endsWith(dialCode)
}

function dialingOptionCountryName(text: string) {
  const name = text.split('+')[0] || ''
  return name
    .replace(/[^\p{L}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizePlace(value: string) {
  return value
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
