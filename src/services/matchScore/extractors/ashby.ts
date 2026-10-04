import { capJdText, htmlToText } from '../htmlText.ts'
import { isUuid, pageUrl, safeToken, type ExtractPage, type JobExtraction, type PostingFetcher } from './page.ts'

export function ashbyPostingUrl(board: string): string {
  return `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}`
}

export async function extractAshby(page: ExtractPage, fetchPosting: PostingFetcher): Promise<JobExtraction | null> {
  const url = pageUrl(page.href)
  if (!url) return null
  const host = url.hostname.toLowerCase()
  if (host !== 'jobs.ashbyhq.com' && !host.endsWith('.ashbyhq.com')) return null
  const parts = url.pathname.split('/').filter(Boolean)
  const board = parts[0] ?? ''
  const id = parts[1] ?? ''
  if (!safeToken(board) || !isUuid(id)) return null
  const body = await fetchPosting(ashbyPostingUrl(board))
  if (!body) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { jobs?: unknown }).jobs)) return null
  const job = (parsed as { jobs: Array<Record<string, unknown>> }).jobs.find((row) => row?.id === id)
  if (!job) return null
  const plain = typeof job.descriptionPlain === 'string' ? job.descriptionPlain : ''
  const html = typeof job.descriptionHtml === 'string' ? htmlToText(job.descriptionHtml) : ''
  const text = capJdText(plain.trim() ? plain : html)
  if (!text) return null
  return { text, source: 'fetched', jobUrl: page.href }
}
