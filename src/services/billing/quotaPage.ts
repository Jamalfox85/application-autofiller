// Free quota is one charge per application the user is filling, not one charge
// per frame, per click, or per step. The service worker is the only place every
// frame of a tab shares, so the claim lives there. A multi-step flow (Workday
// My Information → My Experience, an iCIMS login then the candidate form, a
// hash or ?step= change) collapses to one key for the week.

import { calendarWeekKey } from './quota.ts'

export { calendarWeekKey }

const STEP_SEGMENTS = new Set([
  'apply',
  'application',
  'applymanually',
  'autofillwithresume',
  'usemylastapplication',
  'useexistingapplication',
  'candidate',
  'form',
  'eeo',
  'eeoc',
  'confirmation',
  'confirm',
  'thank-you',
  'thankyou',
  'thanks',
  'success',
  'submitted',
  'review',
  'complete',
  'login',
  'signin',
  'sign-in',
  'register',
  'signup',
  'create-account',
])

const STEP_QUERY = new Set([
  'step',
  'page',
  'stage',
  'tab',
  'currentstep',
  'currentpage',
  'wizardstep',
  'wizard',
])

function segmentsOf(url: URL): string[] {
  return url.pathname.split('/').filter(Boolean)
}

function joinPath(origin: string, parts: string[]): string {
  if (parts.length === 0) return origin
  return `${origin}/${parts.join('/')}`
}

function stripTrailingSteps(parts: string[]): string[] {
  const next = [...parts]
  while (next.length > 0 && STEP_SEGMENTS.has(next[next.length - 1].toLowerCase())) next.pop()
  return next
}

function searchWithoutSteps(url: URL): string {
  const params = new URLSearchParams(url.search)
  for (const key of [...params.keys()]) {
    if (STEP_QUERY.has(key.toLowerCase())) params.delete(key)
  }
  const search = params.toString()
  return search ? `?${search}` : ''
}

function greenhouseJobId(url: URL): string {
  const direct = url.searchParams.get('gh_jid')
  if (direct) return direct
  const hash = url.hash
  const queryAt = hash.indexOf('?')
  if (queryAt === -1) return ''
  return new URLSearchParams(hash.slice(queryAt + 1)).get('gh_jid') || ''
}

function greenhouseKey(url: URL): string {
  const parts = stripTrailingSteps(segmentsOf(url))
  const jid = greenhouseJobId(url)
  const search = jid ? `?gh_jid=${encodeURIComponent(jid)}` : ''
  // encodeURIComponent does not change a numeric id. Keep the raw value when it
  // is already a simple token so an existing job URL stays byte-identical.
  const query = jid && /^[\w.-]+$/.test(jid) ? `?gh_jid=${jid}` : search
  return `${joinPath(url.origin, parts)}${query}`
}

function pathKey(url: URL, dropSearch: boolean): string {
  const path = joinPath(url.origin, stripTrailingSteps(segmentsOf(url)))
  if (dropSearch) return path
  return `${path}${searchWithoutSteps(url)}`
}

function icimsKey(url: URL): string {
  const match = url.pathname.match(/\/jobs\/(\d+)/i)
  if (!match) return pathKey(url, false)
  return `${url.origin}/jobs/${match[1]}`
}

function workdayKey(url: URL): string {
  const parts = stripTrailingSteps(segmentsOf(url))
  const jobAt = parts.findIndex((part) => part.toLowerCase() === 'job')
  const dropSearch = jobAt >= 0 && jobAt < parts.length - 1
  return pathKey(url, dropSearch)
}

function taleoKey(url: URL): string {
  const job = url.searchParams.get('job') || url.searchParams.get('rid') || url.searchParams.get('jobId') || ''
  if (!job) return pathKey(url, false)
  return `${url.origin}/job/${encodeURIComponent(job)}`
}

function hostOf(url: URL): string {
  return url.hostname.toLowerCase()
}

// Drop the hash so a multi-step form that only changes #step does not count
// again. Also collapse step path segments and step query params so a new
// Workday page, an iCIMS reload, or ?step=2 is still the same application.
// Job-identifying query params stay: two postings on one host remain two fills.
export function quotaPageKey(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return ''
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return trimmed.split('#')[0]
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''

  const host = hostOf(parsed)
  if (host.includes('myworkday') || host.endsWith('workday.com')) return workdayKey(parsed)
  if (host.includes('icims.com')) return icimsKey(parsed)
  if (host.includes('lever.co')) return pathKey(parsed, true)
  if (host.includes('ashbyhq.com')) return pathKey(parsed, true)
  if (host === 'apply.workable.com' || host.endsWith('.apply.workable.com')) return pathKey(parsed, true)
  if (host.includes('bamboohr.com')) return pathKey(parsed, true)
  if (host.includes('jobvite.com')) return pathKey(parsed, true)
  if (host.includes('taleo')) return taleoKey(parsed)
  if (host.includes('greenhouse.io') || greenhouseJobId(parsed)) return greenhouseKey(parsed)
  return pathKey(parsed, false)
}

export function decideQuotaClaim(
  claims: Record<string, string> | null | undefined,
  pageKey: string,
  week: string,
): { claimed: boolean; claims: Record<string, string> } {
  const current: Record<string, string> = {}
  for (const [key, value] of Object.entries(claims ?? {})) {
    if (value === week) current[key] = value
  }
  if (!pageKey) return { claimed: false, claims: current }
  if (current[pageKey] === week) return { claimed: false, claims: current }
  current[pageKey] = week
  return { claimed: true, claims: current }
}

export const SUBMITTED_APPLICATIONS_KEY = 'submittedApplicationKeys'

/** One application_submitted per application, even if the user autofills again. */
export function rememberSubmittedApplication(
  already: readonly string[],
  keys: readonly string[],
): { first: boolean; keys: string[] } {
  const incoming = [...new Set(keys.filter((key) => key))]
  if (incoming.length === 0) return { first: false, keys: [...already] }
  if (incoming.some((key) => already.includes(key))) return { first: false, keys: [...already] }
  return { first: true, keys: [...already, ...incoming] }
}

export function forgetQuotaClaim(
  claims: Record<string, string> | null | undefined,
  pageKey: string,
): Record<string, string> {
  if (!pageKey || !claims || !(pageKey in claims)) return { ...(claims ?? {}) }
  const next = { ...claims }
  delete next[pageKey]
  return next
}
