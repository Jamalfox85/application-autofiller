import { capJdText, htmlToText } from '../htmlText.ts'
import type { ExtractDocument, ExtractElement } from './page.ts'

function ldScripts(doc: ExtractDocument): ExtractElement[] {
  if (typeof doc.querySelectorAll === 'function') return Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))
  const one = doc.querySelector('script[type="application/ld+json"]')
  return one ? [one] : []
}

function collect(value: unknown, out: string[], depth: number) {
  if (depth > 8 || value == null) return
  if (Array.isArray(value)) {
    for (const item of value) collect(item, out, depth + 1)
    return
  }
  if (typeof value !== 'object') return
  const row = value as Record<string, unknown>
  const type = row['@type']
  const types = Array.isArray(type) ? type : typeof type === 'string' ? [type] : []
  if (types.includes('JobPosting') && typeof row.description === 'string') {
    const text = htmlToText(row.description)
    if (text) out.push(text)
  }
  if ('@graph' in row) collect(row['@graph'], out, depth + 1)
  if (row.mainEntity) collect(row.mainEntity, out, depth + 1)
}

// Longest JobPosting description in the page. A title or a second short script
// must not replace the posting body.
export function jsonLdJobText(doc: ExtractDocument | null | undefined): string {
  if (!doc) return ''
  const parts: string[] = []
  for (const script of ldScripts(doc)) {
    const raw = script.textContent
    if (!raw || !raw.includes('JobPosting')) continue
    try {
      collect(JSON.parse(raw), parts, 0)
    } catch {
      // A broken script is not a description.
    }
  }
  const longest = parts.reduce((best, item) => (item.length > best.length ? item : best), '')
  return capJdText(longest)
}
