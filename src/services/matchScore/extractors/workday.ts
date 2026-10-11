import type { ExtractPage, JobExtraction } from './page.ts'

// Captured Workday documents do not contain a job description. workday-application.html
// is the apply-flow SPA (applyFlowPage / applyFlowMyInfoPage) with contact fields only.
// workday-search.html is the search document, and the job posting URL test reuses it.
// The apply URL before hydration is an empty #root. No hydrated posting description
// and no documented posting response were captured, so this does not fetch. A missing
// description keeps the card hidden.
export async function extractWorkday(_page: ExtractPage): Promise<JobExtraction | null> {
  return null
}
