import { capJdText, elementJobText } from '../htmlText.ts'
import { jsonLdJobText } from './jsonLd.ts'
import type { ExtractDocument, ExtractPage, JobExtraction } from './page.ts'

// The job page hydrates the posting into .BambooRichText. Opening the apply
// form removes that node and keeps the same posting as JobPosting JSON-LD.
// There is no unauthenticated posting host, so this does not fetch. A missing
// description keeps the card hidden.
export const BAMBOO_DESCRIPTION_SELECTOR = '.BambooRichText'

function bambooDomText(doc: ExtractDocument | null | undefined): string {
  if (!doc) return ''
  const nodes =
    typeof doc.querySelectorAll === 'function'
      ? Array.from(doc.querySelectorAll(BAMBOO_DESCRIPTION_SELECTOR))
      : [doc.querySelector(BAMBOO_DESCRIPTION_SELECTOR)].filter((node) => node != null)
  let best = ''
  for (const node of nodes) {
    const text = elementJobText(node)
    if (text.length > best.length) best = text
  }
  return best
}

export async function extractBambooHr(page: ExtractPage): Promise<JobExtraction | null> {
  const text = capJdText(bambooDomText(page.document) || jsonLdJobText(page.document))
  if (!text) return null
  return { text, source: 'dom', jobUrl: page.href }
}
