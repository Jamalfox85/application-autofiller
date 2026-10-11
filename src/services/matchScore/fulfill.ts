import { configuredResumeApiKey } from '../billing/proApiContract.ts'
import { cacheFresh } from './cache.ts'
import { postMatchScore } from './contract.ts'
import type { JdSource, MatchAts, MatchProfile, MatchScoreResult, ScoredMatch } from './types.ts'

export interface CachedMatchScore {
  at: number
  result: Extract<MatchScoreResult, { kind: 'scored' | 'insufficient_profile' }>
}

export interface FulfillInput {
  isPro: boolean
  dismissed: boolean
  rateLimited: boolean
  // The stored cooldown is the daily extraction cap, not a generic slow-down.
  extractionLimit?: boolean
  // Remaining wait when the server sent Retry-After. Null means "later".
  extractionRetryMs?: number | null
  rescore: boolean
  cached: CachedMatchScore | null
  now: number
  token: string | null
  jobUrl: string
  ats: MatchAts
  jdText: string
  jdSource: JdSource
  profile: MatchProfile
  // Active candidate profile id; sent so the API scores/declines for that profile.
  profileId?: string | null
  baseUrl: string
  apiKey?: string | null
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export type FulfillRelay =
  | { view: 'hide'; reason: 'dismissed' | 'rate_limited' | 'signed_out' | 'unsupported' | 'error' }
  | { view: 'keep' }
  | { view: 'limited'; retryAfterMs: number | null }
  | { view: 'locked'; ats: MatchAts; jdSource: JdSource }
  | {
      view: 'insufficient'
      missing: Array<'skills' | 'experience_descriptions'>
      cached: boolean
      latencyMs: number
      ats: MatchAts
      jdSource: JdSource
    }
  | {
      view: 'scored'
      score: ScoredMatch
      cached: boolean
      latencyMs: number
      ats: MatchAts
      jdSource: JdSource
    }

export interface FulfillOutcome {
  relay: FulfillRelay
  persistRateLimit: boolean
  // Daily extraction cap. A generic 429 stays a plain timestamp and stays hidden.
  extractionLimit?: boolean
  retrySpecified?: boolean
  // How long a 429 should hide this job. Null unless persistRateLimit is set.
  rateLimitMs: number | null
  cacheValue: CachedMatchScore | null
  requested: boolean
}

export function willRequestMatchScore(input: {
  isPro: boolean
  dismissed: boolean
  rateLimited: boolean
  rescore: boolean
  cached: CachedMatchScore | null
  now: number
  token: string | null
  apiKey?: string | null
  jdText: string
}): boolean {
  if (!input.jdText.trim()) return false
  if (input.dismissed) return false
  if (input.rateLimited && !input.rescore) return false
  if (!input.isPro) return false
  if (!input.token) return false
  if (!configuredResumeApiKey(input.apiKey)) return false
  if (!input.rescore && input.cached && cacheFresh(input.cached.at, input.now)) return false
  return true
}

function cachedRelay(cached: CachedMatchScore, input: FulfillInput): FulfillRelay {
  if (cached.result.kind === 'scored') {
    return {
      view: 'scored',
      score: cached.result.score,
      cached: true,
      latencyMs: 0,
      ats: input.ats,
      jdSource: input.jdSource,
    }
  }
  return {
    view: 'insufficient',
    missing: cached.result.missing,
    cached: true,
    latencyMs: 0,
    ats: input.ats,
    jdSource: input.jdSource,
  }
}

export async function fulfillMatchScore(input: FulfillInput): Promise<FulfillOutcome> {
  const none = { persistRateLimit: false, rateLimitMs: null, cacheValue: null, requested: false }
  if (input.dismissed) return { ...none, relay: { view: 'hide', reason: 'dismissed' } }
  if (input.rateLimited && !input.rescore) {
    if (input.extractionLimit) {
      return {
        ...none,
        relay: { view: 'limited', retryAfterMs: input.extractionRetryMs ?? null },
      }
    }
    return { ...none, relay: { view: 'hide', reason: 'rate_limited' } }
  }
  if (!input.jdText.trim()) return { ...none, relay: { view: 'hide', reason: 'error' } }
  if (!input.isPro) {
    return { ...none, relay: { view: 'locked', ats: input.ats, jdSource: input.jdSource } }
  }
  if (!input.token || !configuredResumeApiKey(input.apiKey)) {
    return { ...none, relay: { view: 'hide', reason: 'signed_out' } }
  }
  if (!input.rescore && input.cached && cacheFresh(input.cached.at, input.now)) {
    return { ...none, relay: cachedRelay(input.cached, input) }
  }

  const started = Date.now()
  const result = await postMatchScore({
    body: {
      job_url: input.jobUrl,
      ats: input.ats,
      jd_text: input.jdText,
      jd_source: input.jdSource,
      profile: input.profile,
      ...(input.profileId ? { profile_id: input.profileId } : {}),
    },
    token: input.token,
    baseUrl: input.baseUrl,
    apiKey: input.apiKey,
    fetchImpl: input.fetchImpl,
    timeoutMs: input.timeoutMs,
  })
  const latencyMs = Date.now() - started
  const requested = { persistRateLimit: false, rateLimitMs: null, cacheValue: null, requested: true }

  if (result.kind === 'extraction_limit') {
    const retryAfterMs = result.retrySpecified ? result.retryAfterMs ?? null : null
    return {
      ...requested,
      persistRateLimit: !input.rescore,
      extractionLimit: !input.rescore,
      retrySpecified: result.retrySpecified,
      rateLimitMs: result.retryAfterMs ?? null,
      relay: { view: 'limited', retryAfterMs },
    }
  }
  if (result.kind === 'rate_limited') {
    if (input.rescore) return { ...requested, relay: { view: 'keep' } }
    return {
      ...requested,
      persistRateLimit: true,
      rateLimitMs: result.retryAfterMs ?? null,
      relay: { view: 'hide', reason: 'rate_limited' },
    }
  }
  if (result.kind === 'unauthorized') {
    return { ...requested, relay: { view: 'hide', reason: 'signed_out' } }
  }
  if (result.kind === 'plan_required') {
    return { ...requested, relay: { view: 'hide', reason: 'error' } }
  }
  if (result.kind === 'unsupported' || result.kind === 'hide') {
    return {
      ...requested,
      relay: { view: 'hide', reason: result.kind === 'unsupported' ? 'unsupported' : 'error' },
    }
  }
  if (result.kind === 'insufficient_profile') {
    return {
      ...requested,
      cacheValue: { at: input.now, result },
      relay: {
        view: 'insufficient',
        missing: result.missing,
        cached: false,
        latencyMs,
        ats: input.ats,
        jdSource: input.jdSource,
      },
    }
  }
  return {
    ...requested,
    cacheValue: { at: input.now, result },
    relay: {
      view: 'scored',
      score: result.score,
      cached: false,
      latencyMs,
      ats: input.ats,
      jdSource: input.jdSource,
    },
  }
}
