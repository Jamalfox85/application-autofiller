import { canonicalPlace } from './parsedResume.ts'
import { completePersonalInfo } from './personalInfoDefaults.ts'
import type { PersonalInfo } from '../types/index.ts'

// The address selects only accept canonical values (united_states, Pennsylvania).
// A saved "PA" or "United States" matches none of the options, so both controls
// render blank while the summary still prints the raw city and state.
export function editorPlace(state: unknown, country: unknown): { state: string; country: string } {
  const rawState = typeof state === 'string' ? state.trim() : ''
  const rawCountry = typeof country === 'string' ? country.trim() : ''
  const canonical = canonicalPlace(rawState, rawCountry)
  return {
    state: canonical.state || rawState,
    country: canonical.country || rawCountry,
  }
}

export function personalDetailsForEditor(info: Partial<PersonalInfo> | null | undefined): PersonalInfo {
  const next = completePersonalInfo(info)
  const place = editorPlace(next.state, next.country)
  return { ...next, state: place.state, country: place.country }
}

// The form copies props into local state when it opens. A profile created while that
// copy is on screen (or while the load is still in flight) must replace it. Edits on
// the same profile stay put until the active profile itself changes.
export function shouldRefreshPersonalDetails(input: {
  open: boolean
  dirty: boolean
  profileChanged: boolean
  infoChanged: boolean
}): boolean {
  if (!input.open) return false
  if (input.profileChanged) return true
  return input.infoChanged && !input.dirty
}
