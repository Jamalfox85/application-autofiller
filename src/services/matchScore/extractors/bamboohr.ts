import type { ExtractPage, JobExtraction } from './page.ts'

// Captured BambooHR documents do not contain a job description:
// bamboohr-application.html is the contact form, bamboohr-listing.html is the
// openings index, and the /careers/{id} toast fixture is an empty root because
// that form HTML was not captured. No unauthenticated posting response is
// confirmed, so this does not fetch. A missing description keeps the card hidden.
export async function extractBambooHr(_page: ExtractPage): Promise<JobExtraction | null> {
  return null
}
