export const MATCH_SCORE_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const MATCH_SCORE_RATE_LIMIT_DEFAULT_MS = 60 * 60 * 1000

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

// Retry-After is delta-seconds or an HTTP date. A missing or unreadable value
// waits the default hour. The stored value is the absolute expiry.
export function retryAfterDelayMs(header: string | null | undefined, now: number): number {
  const raw = header?.trim() ?? ''
  if (!raw) return MATCH_SCORE_RATE_LIMIT_DEFAULT_MS
  if (/^\d+$/.test(raw)) return Number(raw) * 1000
  const date = Date.parse(raw)
  if (!Number.isFinite(date)) return MATCH_SCORE_RATE_LIMIT_DEFAULT_MS
  return Math.max(0, date - now)
}

export interface ExtractionLimitRecord {
  until: number
  reason: 'extraction'
  // True when the server sent Retry-After. A default cooldown still waits, but
  // the card does not invent a clock time the response never gave.
  specified: boolean
}

export function extractionLimitRecord(until: number, specified: boolean): ExtractionLimitRecord {
  return { until, reason: 'extraction', specified }
}

export function readRateLimit(stored: unknown): {
  until: number | null
  extraction: boolean
  specified: boolean
} {
  if (typeof stored === 'number' && Number.isFinite(stored)) {
    return { until: stored, extraction: false, specified: false }
  }
  if (!stored || typeof stored !== 'object') return { until: null, extraction: false, specified: false }
  const record = stored as { until?: unknown; reason?: unknown; specified?: unknown }
  if (typeof record.until !== 'number' || !Number.isFinite(record.until)) {
    return { until: null, extraction: false, specified: false }
  }
  return {
    until: record.until,
    extraction: record.reason === 'extraction',
    specified: record.specified === true,
  }
}

export function rateLimitActive(stored: unknown, now: number): boolean {
  const until = readRateLimit(stored).until
  return typeof until === 'number' && until > now
}

export function rateLimitUntil(now: number, delayMs: number | null | undefined): number {
  const delay = typeof delayMs === 'number' && Number.isFinite(delayMs) && delayMs >= 0
    ? delayMs
    : MATCH_SCORE_RATE_LIMIT_DEFAULT_MS
  return now + delay
}
