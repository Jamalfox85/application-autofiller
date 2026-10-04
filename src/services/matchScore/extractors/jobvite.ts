import type { JobExtraction } from './page.ts'

// Jobvite's job feed (api.jobvite.com) requires a customer API key and secret.
// No public unauthenticated posting host was confirmed from Jobvite's docs or a
// live posting page, so this extractor does not fetch.
export async function extractJobvite(): Promise<JobExtraction | null> {
  return null
}
