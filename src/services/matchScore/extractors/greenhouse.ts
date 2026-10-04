import { capJdText, htmlToText } from '../htmlText.ts'
import { pageUrl, safeToken, type ExtractDocument, type ExtractPage, type JobExtraction, type PostingFetcher } from './page.ts'

function greenhouseJobIdParam(url: URL): string | null {
  const direct = url.searchParams.get('gh_jid')
  if (direct && /^\d+$/.test(direct)) return direct
  if (url.hash.includes('?')) {
    const id = new URLSearchParams(url.hash.slice(url.hash.indexOf('?') + 1)).get('gh_jid')
    if (id && /^\d+$/.test(id)) return id
  }
  return null
}

function embedIds(url: URL): { board: string; id: string } | null {
  const board = url.searchParams.get('for') ?? ''
  const id = url.searchParams.get('token') ?? ''
  if (safeToken(board) && /^\d+$/.test(id)) return { board, id }
  return null
}

function pathJob(url: URL): { board: string; id: string } | null {
  const parts = url.pathname.split('/').filter(Boolean)
  const jobsAt = parts.indexOf('jobs')
  if (jobsAt <= 0) return null
  const board = parts[jobsAt - 1] ?? ''
  const id = parts[jobsAt + 1] ?? ''
  if (board === 'embed' || !safeToken(board) || !/^\d+$/.test(id)) return null
  return { board, id }
}

function boardFromFrame(doc: ExtractDocument | null | undefined): { board: string; id?: string } | null {
  const src = doc?.querySelector('iframe[src*="greenhouse.io"]')?.getAttribute('src')
  if (!src) return null
  const url = pageUrl(src) ?? pageUrl(`https://boards.greenhouse.io${src.startsWith('/') ? '' : '/'}${src}`)
  if (!url) return null
  const embed = embedIds(url)
  if (embed) return embed
  const path = pathJob(url)
  if (path) return path
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts.length === 1 && safeToken(parts[0]) && parts[0] !== 'embed') return { board: parts[0] }
  return null
}

function greenhouseTarget(page: ExtractPage): { board: string; id: string; hosted: boolean } | null {
  const url = pageUrl(page.href)
  if (!url) return null
  const host = url.hostname.toLowerCase()
  const onGreenhouse = host === 'greenhouse.io' || host.endsWith('.greenhouse.io')
  if (onGreenhouse) {
    const path = pathJob(url)
    if (path) return { ...path, hosted: true }
    const embed = embedIds(url)
    if (embed) return { ...embed, hosted: false }
  }
  const ghJid = greenhouseJobIdParam(url)
  const frame = boardFromFrame(page.document)
  if (ghJid && frame?.board) return { board: frame.board, id: ghJid, hosted: false }
  if (frame?.board && frame.id) return { board: frame.board, id: frame.id, hosted: false }
  return null
}

function domDescription(page: ExtractPage): string | null {
  const text = capJdText(page.document?.querySelector('.job__description')?.textContent ?? '')
  return text || null
}

export function greenhousePostingUrl(board: string, id: string): string {
  return `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs/${encodeURIComponent(id)}`
}

export async function extractGreenhouse(
  page: ExtractPage,
  fetchPosting: PostingFetcher,
): Promise<JobExtraction | null> {
  const target = greenhouseTarget(page)
  if (!target) return null
  if (target.hosted) {
    const dom = domDescription(page)
    if (dom) return { text: dom, source: 'dom', jobUrl: page.href }
  }
  const body = await fetchPosting(greenhousePostingUrl(target.board, target.id))
  if (!body) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const content = (parsed as { content?: unknown }).content
  if (typeof content !== 'string') return null
  const text = capJdText(htmlToText(content))
  if (!text) return null
  return { text, source: 'fetched', jobUrl: page.href }
}
