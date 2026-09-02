// src/lib/api.ts
//
// Helpers for talking to the Go resume API. The upload request itself runs in the background
// service worker (see background.js + src/composables/useResumeUpload.ts) so a closing popup
// can't abort the 5–10s parse; this module only provides the access token and the response
// normalizer they share.
//
// The old Railway API (autofiller-api-dev.up.railway.app) has been retired — its usage/
// checkout/billing endpoints and the components that called them (Settings.vue,
// UpgradeModal.vue) were removed with it.
import { supabase } from './supabase'
import type { Education, Experience, ParsedResumeData } from '../types'

// Returns a currently-valid Supabase access token, refreshing it first if it's expired (or
// about to be). Throws if there's no session — callers must surface "sign in again" rather
// than let an `Authorization: Bearer null` go out and come back 401.
export async function getValidAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new Error('Not signed in')
  }

  const expiresAtMs = session.expires_at ? session.expires_at * 1000 : 0
  if (expiresAtMs && expiresAtMs - Date.now() < 60_000) {
    const { data, error } = await supabase.auth.refreshSession()
    if (error || !data.session?.access_token) {
      throw new Error('Your session has expired. Please sign in again.')
    }
    return data.session.access_token
  }

  return session.access_token
}

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

  const fullName = str(parsed.name) || str(contact.name)
  if (fullName) {
    const { first, middle, last } = splitName(fullName)
    if (first) out.firstName = first
    if (middle) out.middleName = middle
    if (last) out.lastName = last
  }

  if (str(contact.email)) out.email = str(contact.email)
  if (str(contact.phone)) out.phone = str(contact.phone)
  if (str(contact.linkedin)) out.linkedin = normalizeLinkedin(str(contact.linkedin))
  if (str(contact.website)) out.website = normalizeUrl(str(contact.website))
  if (str(contact.github)) out.github = normalizeUrl(str(contact.github)) // not in the contract; tolerated

  if (str(contact.location)) {
    const { city, state } = splitLocation(str(contact.location))
    if (city) out.city = city
    if (state) out.state = state
  }

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
  const { city, state } = splitLocation(str(r?.location))
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
    degreeType: str(r?.degree),
    major: str(r?.field),
    startYear: yearOf(str(r?.start_date)),
    graduationYear: yearOf(str(r?.end_date)),
    gpa: str(r?.gpa) || undefined,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function splitName(full: string): { first: string; middle: string; last: string } {
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
