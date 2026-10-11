import { capJdText, elementJobText } from '../htmlText.ts'
import { jsonLdJobText } from './jsonLd.ts'
import type { ExtractPage, JobExtraction } from './page.ts'

// The job page hydrates the posting into this node. The apply step does not, but
// it keeps the same posting as JobPosting JSON-LD. There is no unauthenticated
// posting host, so this does not fetch. A missing description keeps the card hidden.
export const WORKDAY_DESCRIPTION_SELECTOR = '[data-automation-id="jobPostingDescription"]'

export async function extractWorkday(page: ExtractPage): Promise<JobExtraction | null> {
  const text = capJdText(
    elementJobText(page.document?.querySelector(WORKDAY_DESCRIPTION_SELECTOR)) || jsonLdJobText(page.document),
  )
  if (!text) return null
  return { text, source: 'dom', jobUrl: page.href }
}
