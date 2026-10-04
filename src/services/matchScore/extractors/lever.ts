import { capJdText, htmlToText } from '../htmlText.ts'
import { isUuid, pageUrl, safeToken, type ExtractPage, type JobExtraction, type PostingFetcher } from './page.ts'

export function leverApiHost(hostname: string): string {
  const host = hostname.toLowerCase()
  if (host === 'api.eu.lever.co' || host.endsWith('.eu.lever.co')) return 'api.eu.lever.co'
  return 'api.lever.co'
}

export function leverPostingUrl(hostname: string, company: string, id: string): string {
  return `https://${leverApiHost(hostname)}/v0/postings/${encodeURIComponent(company)}/${encodeURIComponent(id)}`
}

export async function extractLever(page: ExtractPage, fetchPosting: PostingFetcher): Promise<JobExtraction | null> {
  const url = pageUrl(page.href)
  if (!url || !url.hostname.toLowerCase().endsWith('lever.co')) return null
  const parts = url.pathname.split('/').filter(Boolean)
  const company = parts[0] ?? ''
  const id = parts[1] ?? ''
  if (!safeToken(company) || !isUuid(id)) return null
  const body = await fetchPosting(leverPostingUrl(url.hostname, company, id))
  if (!body) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const posting = parsed as {
    description?: unknown
    descriptionPlain?: unknown
    lists?: unknown
  }
  const plain =
    typeof posting.descriptionPlain === 'string' && posting.descriptionPlain.trim()
      ? posting.descriptionPlain
      : typeof posting.description === 'string'
        ? htmlToText(posting.description)
        : ''
  const lists = Array.isArray(posting.lists) ? posting.lists : []
  const listText = lists
    .map((item) => {
      if (!item || typeof item !== 'object') return ''
      const row = item as { text?: unknown; content?: unknown }
      const title = typeof row.text === 'string' ? row.text : ''
      const content = typeof row.content === 'string' ? htmlToText(row.content) : ''
      return [title, content].filter(Boolean).join(' ')
    })
    .filter(Boolean)
    .join(' ')
  const text = capJdText([plain, listText].filter(Boolean).join(' '))
  if (!text) return null
  return { text, source: 'fetched', jobUrl: page.href }
}
