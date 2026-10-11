import { capJdText, elementJobText } from '../htmlText.ts'
import type { ExtractElement, ExtractPage, JobExtraction } from './page.ts'

// Confirmed on the captured in_iframe=1 job document (fixtures/pages/icims-job-frame.html).
// The career-portal shell only has icims_content_iframe; the description is not in that
// document. Login, password, and candidate documents do not have this node.
// Apply, share, and the powered-by logo sit inside the content node. They are not
// the posting, so they are left out of the text. The live page is not modified.
export const ICIMS_DESCRIPTION_SELECTOR = '.iCIMS_JobContent'
const ICIMS_CHROME_SELECTOR = '.iCIMS_JobOptions, .iCIMS_Logo, .iCIMS_PageFooter'

function withoutChrome(node: ExtractElement | null): ExtractElement | null {
  if (!node) return null
  const element = node as ExtractElement & {
    cloneNode?(deep: boolean): ExtractElement & { querySelectorAll?(selector: string): ArrayLike<{ remove(): void }> }
  }
  if (typeof element.cloneNode !== 'function') return node
  const copy = element.cloneNode(true)
  const chrome = copy.querySelectorAll?.(ICIMS_CHROME_SELECTOR)
  if (chrome) {
    for (const extra of Array.from(chrome)) extra.remove()
  }
  return copy
}

export async function extractIcims(page: ExtractPage): Promise<JobExtraction | null> {
  const text = capJdText(elementJobText(withoutChrome(page.document?.querySelector(ICIMS_DESCRIPTION_SELECTOR) ?? null)))
  if (!text) return null
  return { text, source: 'dom', jobUrl: page.href }
}
