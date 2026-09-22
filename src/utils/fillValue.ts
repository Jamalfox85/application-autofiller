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
export function profileHasAutofillData(info: unknown): boolean {
  if (!info || typeof info !== 'object') return false
  for (const value of Object.values(info as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      if (value.some((item) => profileHasAutofillData(item))) return true
      continue
    }
    if (coerceFillText(value)) return true
  }
  return false
}
