export const MATCH_SCORE_TTL_MS = 7 * 24 * 60 * 60 * 1000

export function matchScoreCacheKey(jobUrl: string, hash: string): string {
  return `matchScore:${jobUrl}:${hash}`
}

export function matchScoreDismissedKey(jobUrl: string): string {
  return `matchScoreDismissed:${jobUrl}`
}

export function matchScoreRateLimitKey(jobUrl: string): string {
  return `matchScoreRateLimited:${jobUrl}`
}

export function cacheFresh(at: number | null | undefined, now: number): boolean {
  return typeof at === 'number' && now - at >= 0 && now - at < MATCH_SCORE_TTL_MS
}
