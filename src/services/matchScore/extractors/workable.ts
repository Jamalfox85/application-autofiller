import { capJdText, elementJobText, htmlToText } from '../htmlText.ts'
import { jsonLdJobText } from './jsonLd.ts'
import { pageUrl, safeToken, type ExtractPage, type JobExtraction, type PostingFetcher } from './page.ts'

// The careers-page help doc still lists www.workable.com/api/accounts/{account}.
// That URL 302s to the widget endpoint, and posting fetches do not follow redirects.
// The widget host is the apex apply.workable.com. The service worker lists that
// origin in host_permissions and connect-src.
// Live Hugging Face response is { name, description, jobs: [{ shortcode, description, ... }] }.
export function workablePostingUrl(account: string): string {
  return `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(account)}?details=true`
}

function workableJob(url: URL): { account: string; shortcode: string } | null {
  const host = url.hostname.toLowerCase()
  if (host !== 'apply.workable.com' && !host.endsWith('.apply.workable.com')) return null
  const parts = url.pathname.split('/').filter(Boolean)
  const account = parts[0] ?? ''
  const marker = parts[1] ?? ''
  const shortcode = parts[2] ?? ''
  if (marker !== 'j' || !safeToken(account) || !safeToken(shortcode)) return null
  return { account, shortcode }
}

// The overview renders the posting. The apply step keeps the form and drops this node.
function workableDomDescription(page: ExtractPage): string {
  const description = elementJobText(page.document?.querySelector('[data-ui="job-description"]'))
  const requirements = elementJobText(page.document?.querySelector('[data-ui="job-requirements"]'))
  const sections = capJdText([description, requirements].filter(Boolean).join('\n\n'))
  if (sections) return sections
  return jsonLdJobText(page.document)
}

export async function extractWorkable(page: ExtractPage, fetchPosting: PostingFetcher): Promise<JobExtraction | null> {
  const url = pageUrl(page.href)
  if (!url) return null
  const job = workableJob(url)
  if (!job) return null
  const dom = workableDomDescription(page)
  if (dom) return { text: dom, source: 'dom', jobUrl: page.href }
  const body = await fetchPosting(workablePostingUrl(job.account))
  if (!body) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { jobs?: unknown }).jobs)) return null
  const needle = job.shortcode.toLowerCase()
  const row = (parsed as { jobs: Array<Record<string, unknown>> }).jobs.find((item) => {
    return typeof item?.shortcode === 'string' && item.shortcode.toLowerCase() === needle
  })
  if (!row || typeof row.description !== 'string') return null
  const text = capJdText(htmlToText(row.description))
  if (!text) return null
  return { text, source: 'fetched', jobUrl: page.href }
}
