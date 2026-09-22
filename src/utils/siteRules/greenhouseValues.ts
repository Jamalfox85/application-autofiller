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

const DISCIPLINE_ALIASES: Record<string, string> = {
  cs: 'Computer Science',
  'comp sci': 'Computer Science',
  'computer sci': 'Computer Science',
  ee: 'Electrical Engineering',
  ece: 'Electrical Engineering',
  me: 'Mechanical Engineering',
}

export function disciplineSearchValues(major?: string): string[] {
  if (!major?.trim()) return []
  const trimmed = major.trim()
  const alias = DISCIPLINE_ALIASES[trimmed.toLowerCase()]
  const stripped = trimmed
    .replace(
      /^(b\.?s\.?|b\.?a\.?|m\.?s\.?|bachelor of science in|bachelor of arts in|master of science in)\s+/i,
      '',
    )
    .trim()
  return unique([alias || '', stripped, trimmed])
}

export function schoolSearchValues(schoolName?: string): string[] {
  if (!schoolName?.trim()) return []
  const trimmed = schoolName.trim()
  const simplified = trimmed.replace(/[.]/g, '').replace(/\s+/g, ' ').trim()
  const withoutParens = simplified.replace(/\s*\([^)]*\)/g, '').trim()
  return unique([trimmed, simplified, withoutParens])
}

export function monthNameFromLooseDate(value?: string): string | null {
  if (!value?.trim()) return null
  const iso = value.match(/\b(?:19|20)\d{2}-(\d{2})\b/)
  if (iso) {
    const index = Number(iso[1]) - 1
    if (index >= 0 && index < 12) return MONTHS[index]
  }
  const lower = value.toLowerCase()
  return MONTHS.find((month) => lower.includes(month.toLowerCase())) ?? null
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
