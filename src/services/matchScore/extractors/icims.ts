import { canonicalMatchJobUrl } from '../jobUrl.ts'
import { capJdText, elementJobText } from '../htmlText.ts'
import type { ExtractElement, ExtractPage, JobExtraction } from './page.ts'

// Confirmed on the captured in_iframe=1 job document (fixtures/pages/icims-job-frame.html).
// The career-portal shell only has icims_content_iframe; the description is not in that
// document. Login, password, and candidate documents do not have this node.
// Apply, share, email-a-friend, and the powered-by logo sit inside the content node.
// They are not the posting, so they are left out of the text. The live page is not modified.
export const ICIMS_DESCRIPTION_SELECTOR = '.iCIMS_JobContent'
const ICIMS_CHROME_SELECTOR = '.iCIMS_JobOptions, .iCIMS_Logo, .iCIMS_PageFooter, .iCIMS_EmailJob'

function isChromeBlock(value: string): boolean {
  const text = value.replace(/\s+/g, ' ').trim()
  if (!text || text.length > 180) return false
  if (!/email this job to a friend|powered by icims|application faqs|share on your newsfeed|www\.icims\.com/i.test(text)) {
    return false
  }
  const leftover = text
    .replace(/email this job to a friend/gi, ' ')
    .replace(/software powered by icims/gi, ' ')
    .replace(/powered by icims/gi, ' ')
    .replace(/application faqs/gi, ' ')
    .replace(/share on your newsfeed/gi, ' ')
    .replace(/www\.icims\.com/gi, ' ')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
  return leftover.length === 0
}

function withoutChrome(node: ExtractElement | null): ExtractElement | null {
  if (!node) return null
  const element = node as ExtractElement & {
    cloneNode?(deep: boolean): ExtractElement & {
      querySelectorAll?(selector: string): ArrayLike<{ remove(): void; textContent: string | null; isConnected?: boolean }>
    }
  }
  if (typeof element.cloneNode !== 'function') return node
  const copy = element.cloneNode(true)
  const chrome = copy.querySelectorAll?.(ICIMS_CHROME_SELECTOR)
  if (chrome) {
    for (const extra of Array.from(chrome)) extra.remove()
  }
  const blocks = copy.querySelectorAll?.('*')
  if (blocks) {
    for (const block of Array.from(blocks).reverse()) {
      if (block.isConnected === false) continue
      if (isChromeBlock(block.textContent ?? '')) block.remove()
    }
  }
  return copy
}

function withoutChromeLines(text: string): string {
  return text
    .split('\n')
    .filter((line) => !isChromeBlock(line))
    .join('\n')
}

export async function extractIcims(page: ExtractPage): Promise<JobExtraction | null> {
  const text = capJdText(
    withoutChromeLines(elementJobText(withoutChrome(page.document?.querySelector(ICIMS_DESCRIPTION_SELECTOR) ?? null))),
  )
  if (!text) return null
  return { text, source: 'dom', jobUrl: canonicalMatchJobUrl(page.href) }
}
