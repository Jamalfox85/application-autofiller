// Values that must never be typed into an application field. String(undefined)
// is the string "undefined", which is truthy, so a missing profile key used to
// be written as those nine characters. "null" and a name made only of those
// tokens (for example `${undefined} ${undefined}`) are the same bug.

const BANNED_FILL_TEXT = /^(?:undefined|null|nan)(?:\s+(?:undefined|null|nan))*$/i

export const EMPTY_PROFILE_FILL_MESSAGE =
  'Your GoFillr profile is empty. Add your name, email, and phone, then try again.'

export function coerceFillText(value: unknown): string | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    return String(value)
  }
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || BANNED_FILL_TEXT.test(trimmed)) return null
  return trimmed
}

// True when the stored profile has at least one real answer. The install
// handler writes personalInfo: {}, which is truthy, so a bare existence check
// is not enough.
// Keys the app pre-fills for every profile (default country code, toggles). They
// are not answers the user gave, so on their own they do not make a profile
// fillable. A default "+1" used to make an empty profile look populated, which
// sent the fill into a 25 second field scan that wrote nothing.
const DEFAULT_ONLY_KEYS = new Set([
  'phoneCountryCode',
  'eeoAnswersEnabled',
  'salaryNegotiable',
  // Seeded from the sign-in account at first launch. Email alone is not a filled-in profile:
  // with only this, Skip-for-now left the Dropbox form filling Email and a default US country.
  'email',
])

export function profileHasAutofillData(info: unknown): boolean {
  if (!info || typeof info !== 'object') return false
  for (const [key, value] of Object.entries(info as Record<string, unknown>)) {
    if (DEFAULT_ONLY_KEYS.has(key)) continue
    if (Array.isArray(value)) {
      if (value.some((item) => profileHasAutofillData(item))) return true
      continue
    }
    if (coerceFillText(value)) return true
  }
  return false
}
