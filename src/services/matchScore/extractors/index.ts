import { atsExtractorEnabled, matchScoreEnabled } from '../flags.ts'
import { extractAshby } from './ashby.ts'
import { extractBambooHr } from './bamboohr.ts'
import { extractGreenhouse } from './greenhouse.ts'
import { extractIcims } from './icims.ts'
import { extractJobvite } from './jobvite.ts'
import { extractLever } from './lever.ts'
import type { ExtractPage, JobExtraction, PostingFetcher } from './page.ts'
import { extractWorkable } from './workable.ts'
import { extractWorkday } from './workday.ts'

export type { ExtractPage, JobExtraction, PostingFetcher } from './page.ts'

export async function extractJobDescription(
  ats: string,
  page: ExtractPage,
  fetchPosting: PostingFetcher,
): Promise<JobExtraction | null> {
  if (!matchScoreEnabled() || !atsExtractorEnabled(ats)) return null
  switch (ats) {
    case 'greenhouse':
      return extractGreenhouse(page, fetchPosting)
    case 'ashby':
      return extractAshby(page, fetchPosting)
    case 'lever':
      return extractLever(page, fetchPosting)
    case 'jobvite':
      return extractJobvite(page)
    case 'workable':
      return extractWorkable(page, fetchPosting)
    case 'bamboohr':
      return extractBambooHr(page)
    case 'icims':
      return extractIcims(page)
    case 'workday':
      return extractWorkday(page)
    default:
      return null
  }
}
