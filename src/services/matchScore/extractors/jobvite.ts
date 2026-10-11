import { capJdText, elementJobText } from '../htmlText.ts'
import { jsonLdJobText } from './jsonLd.ts'
import type { ExtractPage, JobExtraction } from './page.ts'

// The job page ships the posting in .jv-job-detail-description (and JobPosting
// JSON-LD). The apply form does not include that node. Jobvite's feed requires a
// customer key, so this does not fetch. A missing description keeps the card hidden.
export async function extractJobvite(page: ExtractPage): Promise<JobExtraction | null> {
  const text = capJdText(
    elementJobText(page.document?.querySelector('.jv-job-detail-description')) || jsonLdJobText(page.document),
  )
  if (!text) return null
  return { text, source: 'dom', jobUrl: page.href }
}
