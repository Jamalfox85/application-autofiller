import type { ExtractPage, JobExtraction } from './page.ts'

// Jobvite's job feed (api.jobvite.com) requires a customer API key and secret.
// No public unauthenticated posting host was confirmed, so this does not fetch.
// Captured pages also have no description body: jobvite-apply-shell.html is a title
// (h2.jv-header) plus an empty apply form, jobvite-application.html is contact fields,
// and jobvite-board.html is a listing. The title is not the description. A missing
// description keeps the card hidden.
export async function extractJobvite(_page?: ExtractPage): Promise<JobExtraction | null> {
  return null
}
