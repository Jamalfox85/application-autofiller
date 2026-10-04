// GET allowlist for job-posting fetches. Hosts are limited to vendor-documented
// public APIs that were checked against a live response or the vendor's docs.
// Jobvite is absent: its job feed requires a customer key.

export const POSTING_HOSTS = [
  'boards-api.greenhouse.io',
  'api.lever.co',
  'api.eu.lever.co',
  'api.ashbyhq.com',
  'www.workable.com',
] as const

export function postingUrlAllowed(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  if (url.username || url.password) return false
  return (POSTING_HOSTS as readonly string[]).includes(url.hostname)
}
