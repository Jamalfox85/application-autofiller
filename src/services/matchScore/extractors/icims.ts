import { capJdText } from '../htmlText.ts'
import type { ExtractPage, JobExtraction } from './page.ts'

// Confirmed on the captured in_iframe=1 job document (fixtures/pages/icims-job-frame.html).
// The career-portal shell only has icims_content_iframe; the description is not in that
// document. Login, password, and candidate documents do not have this node.
export const ICIMS_DESCRIPTION_SELECTOR = '.iCIMS_JobContent'

export async function extractIcims(page: ExtractPage): Promise<JobExtraction | null> {
  const text = capJdText(page.document?.querySelector(ICIMS_DESCRIPTION_SELECTOR)?.textContent ?? '')
  if (!text) return null
  return { text, source: 'dom', jobUrl: page.href }
}
