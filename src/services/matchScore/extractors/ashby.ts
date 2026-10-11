import { capJdText, elementJobText, htmlToText } from '../htmlText.ts'
import { jsonLdJobText } from './jsonLd.ts'
import { isUuid, pageUrl, safeToken, type ExtractPage, type JobExtraction, type PostingFetcher } from './page.ts'

export function ashbyPostingUrl(board: string): string {
  return `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}`
}

function ashbyJob(url: URL): { board: string; id: string } | null {
  const host = url.hostname.toLowerCase()
  if (host !== 'jobs.ashbyhq.com' && !host.endsWith('.ashbyhq.com')) return null
  const parts = url.pathname.split('/').filter(Boolean)
  const board = parts[0] ?? ''
  const id = parts[1] ?? ''
  if (!safeToken(board) || !isUuid(id)) return null
  return { board, id }
}

// Overview and apply both ship the posting as JobPosting JSON-LD. The apply
// document renders inputs without a form and without the overview description node.
function ashbyDomDescription(page: ExtractPage): string {
  const fromLd = jsonLdJobText(page.document)
  if (fromLd) return fromLd
  return capJdText(elementJobText(page.document?.querySelector('.ashby-job-posting-description')))
}

export async function extractAshby(page: ExtractPage, fetchPosting: PostingFetcher): Promise<JobExtraction | null> {
  const url = pageUrl(page.href)
  if (!url) return null
  const job = ashbyJob(url)
  if (!job) return null
  const dom = ashbyDomDescription(page)
  if (dom) return { text: dom, source: 'dom', jobUrl: page.href }
  const body = await fetchPosting(ashbyPostingUrl(job.board))
  if (!body) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { jobs?: unknown }).jobs)) return null
  const row = (parsed as { jobs: Array<Record<string, unknown>> }).jobs.find((item) => item?.id === job.id)
  if (!row) return null
  const plain = typeof row.descriptionPlain === 'string' ? row.descriptionPlain : ''
  const html = typeof row.descriptionHtml === 'string' ? htmlToText(row.descriptionHtml) : ''
  const text = capJdText(plain.trim() ? plain : html)
  if (!text) return null
  return { text, source: 'fetched', jobUrl: page.href }
}
