import { capJdText, htmlToText } from '../htmlText.ts'
import { pageUrl, safeToken, type ExtractPage, type JobExtraction, type PostingFetcher } from './page.ts'

// Documented by Workable Help ("Using the Workable API to create a careers page"):
// GET https://www.workable.com/api/accounts/{subdomain}?details=true
// Live Acely response is { name, description, jobs: [{ shortcode, description, ... }] }.
export function workablePostingUrl(account: string): string {
  return `https://www.workable.com/api/accounts/${encodeURIComponent(account)}?details=true`
}

export async function extractWorkable(page: ExtractPage, fetchPosting: PostingFetcher): Promise<JobExtraction | null> {
  const url = pageUrl(page.href)
  if (!url) return null
  const host = url.hostname.toLowerCase()
  if (host !== 'apply.workable.com' && !host.endsWith('.apply.workable.com')) return null
  const parts = url.pathname.split('/').filter(Boolean)
  const account = parts[0] ?? ''
  const marker = parts[1] ?? ''
  const shortcode = parts[2] ?? ''
  if (marker !== 'j' || !safeToken(account) || !safeToken(shortcode)) return null
  const body = await fetchPosting(workablePostingUrl(account))
  if (!body) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { jobs?: unknown }).jobs)) return null
  const needle = shortcode.toLowerCase()
  const job = (parsed as { jobs: Array<Record<string, unknown>> }).jobs.find((row) => {
    return typeof row?.shortcode === 'string' && row.shortcode.toLowerCase() === needle
  })
  if (!job || typeof job.description !== 'string') return null
  const text = capJdText(htmlToText(job.description))
  if (!text) return null
  return { text, source: 'fetched', jobUrl: page.href }
}
