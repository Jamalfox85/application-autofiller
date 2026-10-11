import { canonicalMatchJobUrl } from '../jobUrl.ts'
import { capJdText, elementJobText } from '../htmlText.ts'
import { jsonLdJobText, jsonLdJobTitle } from './jsonLd.ts'
import type { ExtractDocument, ExtractPage, JobExtraction } from './page.ts'

// The job page hydrates the posting into this node. The apply step does not, but
// it keeps the same posting as JobPosting JSON-LD. There is no unauthenticated
// posting host, so this does not fetch. A missing description keeps the card hidden.
export const WORKDAY_DESCRIPTION_SELECTOR = '[data-automation-id="jobPostingDescription"]'
export const WORKDAY_HEADER_SELECTOR = '[data-automation-id="jobPostingHeader"]'

function plainLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

// The description node omits the role name. The header (or the posting script's
// title) is the role. Skip it when the body already contains that text.
function withTitle(title: string, body: string): string {
  const heading = plainLine(title)
  if (!heading || !body) return body
  if (body.toLowerCase().includes(heading.toLowerCase())) return body
  return `${heading}\n${body}`
}

function postingTitle(doc: ExtractDocument | null | undefined): string {
  const header = plainLine(doc?.querySelector(WORKDAY_HEADER_SELECTOR)?.textContent ?? '')
  if (header) return header
  return jsonLdJobTitle(doc)
}

export async function extractWorkday(page: ExtractPage): Promise<JobExtraction | null> {
  const body =
    elementJobText(page.document?.querySelector(WORKDAY_DESCRIPTION_SELECTOR)) || jsonLdJobText(page.document)
  const text = capJdText(withTitle(postingTitle(page.document), body))
  if (!text) return null
  return { text, source: 'dom', jobUrl: canonicalMatchJobUrl(page.href) }
}
