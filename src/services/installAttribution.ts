// Install attribution captured from URLs the extension can actually see.
//
// Chrome does not give an extension the Chrome Web Store referrer or the listing's
// query string on chrome.runtime.onInstalled (only reason / previousVersion). UTMs
// survive on the store listing tab and on our own landing tab, so those hosts are
// the only pages we read. Anything else — job applications, in particular — is ignored
// so query strings that may contain emails never become analytics properties.

export const INSTALL_SOURCE_STORAGE_KEY = 'installSource'

// How long after install we still accept a landing-page enrichment (referrer / UTMs
// that were not on the tab URL at the moment onInstalled fired).
export const FIRST_RUN_WINDOW_MS = 15 * 60 * 1000

export const ATTRIBUTION_PARAM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'campaign',
] as const

const STORE_HOSTS = new Set(['chromewebstore.google.com', 'chrome.google.com'])
const LANDING_HOSTS = new Set(['gofillr.com', 'www.gofillr.com'])

const MAX_VALUE_LEN = 100
const MAX_ORIGIN_LEN = 120

export type InstallSourceRecord = {
  install_source?: string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_content?: string
  utm_term?: string
  campaign?: string
  referrer?: string
  captured_at?: string
  source_locked_at?: string
}

export type AttributionTab = {
  url?: string
  active?: boolean
}

export function isAttributionHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  return STORE_HOSTS.has(host) || LANDING_HOSTS.has(host)
}

// Campaign tokens only. Full URLs and emails are dropped so a query value can't
// carry a path, address, or account id into Mixpanel.
export function sanitizeAttributionValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > MAX_VALUE_LEN) return undefined
  if (trimmed.includes('@')) return undefined
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return undefined
  if (/^https?:\/\//i.test(trimmed)) return undefined
  return trimmed
}

// Origin only. The path and query of a referrer are where account identifiers show up.
export function referrerOrigin(referrer: unknown): string | undefined {
  if (typeof referrer !== 'string' || !referrer.trim()) return undefined
  try {
    const url = new URL(referrer.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
    if (!url.hostname || url.origin.length > MAX_ORIGIN_LEN) return undefined
    return url.origin
  } catch {
    return undefined
  }
}

function sanitizeField(key: string, value: unknown): string | undefined {
  if (key === 'referrer') return referrerOrigin(value) || sanitizeAttributionValue(value)
  return sanitizeAttributionValue(value)
}

function readParams(url: URL): URLSearchParams {
  const params = new URLSearchParams(url.search)
  const hash = url.hash.startsWith('#') ? url.hash.slice(1) : ''
  if (!hash.includes('=')) return params
  const hashParams = new URLSearchParams(hash)
  for (const [key, value] of hashParams) {
    if (!params.has(key)) params.append(key, value)
  }
  return params
}

export function attributionFromUrl(urlString: unknown): InstallSourceRecord {
  if (typeof urlString !== 'string' || !urlString) return {}
  let url: URL
  try {
    url = new URL(urlString)
  } catch {
    return {}
  }

  const params = readParams(url)
  const fields: InstallSourceRecord = {}
  for (const key of ATTRIBUTION_PARAM_KEYS) {
    const clean = sanitizeAttributionValue(params.get(key) || '')
    if (clean) fields[key] = clean
  }

  const referrerParam = params.get('referrer')
  if (referrerParam) {
    const clean = sanitizeField('referrer', referrerParam)
    if (clean) fields.referrer = clean
  }
  return fields
}

export function attributionFromLanding(urlString: unknown, referrer: unknown): InstallSourceRecord {
  if (typeof urlString !== 'string' || !urlString) return {}
  let url: URL
  try {
    url = new URL(urlString)
  } catch {
    return {}
  }
  if (!isAttributionHost(url.hostname)) return {}

  const fields = attributionFromUrl(urlString)
  const origin = referrerOrigin(referrer)
  if (origin && origin !== url.origin && !fields.referrer) fields.referrer = origin
  return fields
}

export function mergeInstallSource(
  existing: InstallSourceRecord | null | undefined,
  incoming: InstallSourceRecord | null | undefined,
  options?: { allowChannel?: boolean },
): { record: InstallSourceRecord; changed: boolean } {
  const allowed = new Set<string>([...ATTRIBUTION_PARAM_KEYS, 'referrer'])
  if (options?.allowChannel) allowed.add('install_source')

  const base: InstallSourceRecord = existing && typeof existing === 'object' ? { ...existing } : {}
  const next: InstallSourceRecord = { ...base }
  let changed = false

  for (const [key, value] of Object.entries(incoming || {})) {
    if (!allowed.has(key)) continue
    const clean = sanitizeField(key, value)
    if (!clean) continue
    if (next[key as keyof InstallSourceRecord]) continue
    next[key as keyof InstallSourceRecord] = clean
    changed = true
  }

  if (!changed) return { record: base, changed: false }
  if (!next.captured_at) next.captured_at = new Date().toISOString()
  return { record: next, changed: true }
}

export function installSourceProperties(
  record: InstallSourceRecord | null | undefined,
): Record<string, string> {
  if (!record || typeof record !== 'object') return {}
  const props: Record<string, string> = {}
  const keys = ['install_source', ...ATTRIBUTION_PARAM_KEYS, 'referrer']
  for (const key of keys) {
    const clean = sanitizeField(key, record[key as keyof InstallSourceRecord])
    if (clean) props[key] = clean
  }
  return props
}

export function isFirstRunWindowOpen(
  record: InstallSourceRecord | null | undefined,
  now = Date.now(),
): boolean {
  if (!record?.source_locked_at) return false
  const lockedAt = Date.parse(record.source_locked_at)
  if (Number.isNaN(lockedAt)) return false
  const age = now - lockedAt
  return age >= 0 && age <= FIRST_RUN_WINDOW_MS
}

// Enrichment is allowed during the open window, and also before the install
// handler has locked the record (the service worker's startup backfill can run
// first). A record with no lock is only eligible for FIRST_RUN_WINDOW_MS after
// it was captured, so a later visit to the marketing site can't rewrite it.
export function canEnrichInstallSource(
  record: InstallSourceRecord | null | undefined,
  now = Date.now(),
): boolean {
  if (record?.source_locked_at) return isFirstRunWindowOpen(record, now)
  if (!record?.captured_at) return true
  const capturedAt = Date.parse(record.captured_at)
  if (Number.isNaN(capturedAt)) return false
  const age = now - capturedAt
  return age >= 0 && age <= FIRST_RUN_WINDOW_MS
}

export function attributionFromTabUrls(tabs: AttributionTab[]): InstallSourceRecord {
  const ranked: { score: number; fields: InstallSourceRecord }[] = []

  for (const tab of tabs) {
    if (!tab?.url) continue
    let url: URL
    try {
      url = new URL(tab.url)
    } catch {
      continue
    }
    if (!isAttributionHost(url.hostname)) continue
    const fields = attributionFromUrl(tab.url)
    if (Object.keys(fields).length === 0) continue

    const host = url.hostname.toLowerCase()
    let score = 10
    if (tab.active) score -= 5
    score -= STORE_HOSTS.has(host) ? 3 : 2
    ranked.push({ score, fields })
  }

  ranked.sort((a, b) => a.score - b.score)
  let record: InstallSourceRecord = {}
  for (const item of ranked) {
    record = mergeInstallSource(record, item.fields).record
  }
  return record
}
