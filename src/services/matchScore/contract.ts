import { isPlanRequiredResponse } from '../billing/planRequired.ts'
import { proResumeHeaders, resumeApiBaseUrl } from '../billing/proApiContract.ts'
import {
  JD_TEXT_MAX,
  MATCH_SCORE_TIMEOUT_MS,
  type Dealbreaker,
  type DealbreakerType,
  type JdSource,
  type MatchAts,
  type MatchBand,
  type MatchConfidence,
  type MatchProfile,
  type MatchScoreRequest,
  type MatchScoreResult,
  type MatchedItem,
  type MatchedKind,
  type MissingProfile,
  type Notice,
  type NoticeType,
  type QuickAnswer,
  type ScoredMatch,
  type Suggestion,
  type SuggestionKind,
  type UnsupportedReason,
  isMatchAts,
} from './types.ts'

export const MATCH_SCORE_PATHS = {
  score: '/match-score',
  decline: '/match-score/decline',
} as const

const BANDS = new Set<MatchBand>(['very_strong', 'good', 'okay', 'weak'])
const CONFIDENCE = new Set<MatchConfidence>(['high', 'low'])
const MATCHED_KINDS = new Set<MatchedKind>(['must', 'nice'])
const SUGGESTION_KINDS = new Set<SuggestionKind>(['must', 'years', 'nice', 'education'])
const DEALBREAKERS = new Set<DealbreakerType>(['sponsorship', 'location'])
const NOTICES = new Set<NoticeType>(['clearance', 'license'])
const MISSING = new Set<MissingProfile>(['skills', 'experience_descriptions'])
const UNSUPPORTED = new Set<UnsupportedReason>(['non_english', 'jd_too_short'])

export function matchScoreRequestBody(input: {
  jobUrl: string
  ats: MatchAts
  jdText: string
  jdSource: JdSource
  profile: MatchProfile
}): MatchScoreRequest {
  return {
    job_url: input.jobUrl,
    ats: input.ats,
    jd_text: input.jdText.slice(0, JD_TEXT_MAX),
    jd_source: input.jdSource,
    profile: input.profile,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object'
}

function integer(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function parseQuickAnswer(value: unknown): QuickAnswer | undefined {
  if (!isRecord(value)) return undefined
  const skill = text(value.skill)
  const question = text(value.question)
  if (!skill || !question) return undefined
  return { skill: skill.trim(), question: question.trim() }
}

function parseMatched(value: unknown): MatchedItem[] {
  if (!Array.isArray(value)) return []
  const items: MatchedItem[] = []
  for (const row of value) {
    if (!isRecord(row)) continue
    const label = text(row.label)
    const kind = row.kind
    if (!label || typeof kind !== 'string' || !MATCHED_KINDS.has(kind as MatchedKind)) continue
    items.push({ label: label.trim(), kind: kind as MatchedKind })
    if (items.length === 3) break
  }
  return items
}

function parseSuggestions(value: unknown): Suggestion[] {
  if (!Array.isArray(value)) return []
  const items: Suggestion[] = []
  for (const row of value) {
    if (!isRecord(row)) continue
    const id = text(row.id)
    const kind = row.kind
    const suggestionText = text(row.text)
    if (!id || !suggestionText || typeof kind !== 'string' || !SUGGESTION_KINDS.has(kind as SuggestionKind)) {
      continue
    }
    const suggestion: Suggestion = {
      id: id.trim(),
      kind: kind as SuggestionKind,
      text: suggestionText.trim(),
    }
    if (suggestion.kind === 'must' || suggestion.kind === 'nice') {
      const answer = parseQuickAnswer(row.quick_answer)
      if (answer) suggestion.quick_answer = answer
    }
    items.push(suggestion)
    if (items.length === 3) break
  }
  return items
}

function parseDealbreakers(value: unknown): Dealbreaker[] {
  if (!Array.isArray(value)) return []
  const items: Dealbreaker[] = []
  for (const row of value) {
    if (!isRecord(row)) continue
    const type = row.type
    const rowText = text(row.text)
    if (!rowText || typeof type !== 'string' || !DEALBREAKERS.has(type as DealbreakerType)) continue
    items.push({ type: type as DealbreakerType, text: rowText.trim() })
  }
  return items
}

function parseNotices(value: unknown): Notice[] {
  if (!Array.isArray(value)) return []
  const items: Notice[] = []
  for (const row of value) {
    if (!isRecord(row)) continue
    const type = row.type
    const rowText = text(row.text)
    if (!rowText || typeof type !== 'string' || !NOTICES.has(type as NoticeType)) continue
    items.push({ type: type as NoticeType, text: rowText.trim() })
  }
  return items
}

export function parseMatchScoreBody(status: number, body: unknown): MatchScoreResult {
  if (isPlanRequiredResponse(status, body)) return { kind: 'plan_required' }
  if (status === 429) return { kind: 'rate_limited' }
  if (status >= 500 || status < 200) return { kind: 'hide' }
  if (status !== 200 || !isRecord(body)) return { kind: 'hide' }

  if (body.status === 'insufficient_profile') {
    const missing = Array.isArray(body.missing)
      ? body.missing.filter((item): item is MissingProfile => typeof item === 'string' && MISSING.has(item as MissingProfile))
      : []
    return { kind: 'insufficient_profile', missing }
  }

  if (body.status === 'unsupported') {
    const reason = body.reason
    if (typeof reason === 'string' && UNSUPPORTED.has(reason as UnsupportedReason)) {
      return { kind: 'unsupported', reason: reason as UnsupportedReason }
    }
    return { kind: 'hide' }
  }

  if (body.status !== 'scored') return { kind: 'hide' }

  const score = integer(body.score)
  const scoreVersion = integer(body.score_version)
  const requirementsVersion = integer(body.requirements_version)
  const band = body.band
  const confidence = body.confidence
  if (
    score == null ||
    score < 1 ||
    score > 100 ||
    scoreVersion == null ||
    requirementsVersion == null ||
    typeof band !== 'string' ||
    !BANDS.has(band as MatchBand) ||
    typeof confidence !== 'string' ||
    !CONFIDENCE.has(confidence as MatchConfidence) ||
    typeof body.strong_match !== 'boolean' ||
    typeof body.cached_requirements !== 'boolean'
  ) {
    return { kind: 'hide' }
  }

  const parsed: ScoredMatch = {
    status: 'scored',
    score,
    band: band as MatchBand,
    confidence: confidence as MatchConfidence,
    strong_match: body.strong_match,
    matched: parseMatched(body.matched),
    suggestions: parseSuggestions(body.suggestions),
    dealbreakers: parseDealbreakers(body.dealbreakers),
    notices: parseNotices(body.notices),
    score_version: scoreVersion,
    requirements_version: requirementsVersion,
    cached_requirements: body.cached_requirements,
  }
  return { kind: 'scored', score: parsed }
}

async function readJson(response: Response): Promise<unknown> {
  const raw = await response.text()
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function postMatchScore(input: {
  body: MatchScoreRequest
  token: string
  baseUrl: string
  apiKey?: string | null
  fetchImpl?: typeof fetch
  timeoutMs?: number
}): Promise<MatchScoreResult> {
  if (!isMatchAts(input.body.ats)) return { kind: 'hide' }
  const fetchImpl = input.fetchImpl ?? fetch
  const controller = new AbortController()
  const timeoutMs = input.timeoutMs ?? MATCH_SCORE_TIMEOUT_MS
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(`${resumeApiBaseUrl(input.baseUrl)}${MATCH_SCORE_PATHS.score}`, {
      method: 'POST',
      headers: proResumeHeaders(input.token, input.apiKey),
      body: JSON.stringify(input.body),
      signal: controller.signal,
    })
    const parsed = await readJson(response)
    return parseMatchScoreBody(response.status, parsed)
  } catch {
    return { kind: 'hide' }
  } finally {
    clearTimeout(timer)
  }
}

export async function postMatchScoreDecline(input: {
  skill: string
  method: 'POST' | 'DELETE'
  token: string
  baseUrl: string
  apiKey?: string | null
  fetchImpl?: typeof fetch
  timeoutMs?: number
}): Promise<{ ok: boolean }> {
  const skill = input.skill.trim()
  if (!skill) return { ok: false }
  const fetchImpl = input.fetchImpl ?? fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? MATCH_SCORE_TIMEOUT_MS)
  try {
    const response = await fetchImpl(`${resumeApiBaseUrl(input.baseUrl)}${MATCH_SCORE_PATHS.decline}`, {
      method: input.method,
      headers: proResumeHeaders(input.token, input.apiKey),
      body: JSON.stringify({ skill }),
      signal: controller.signal,
    })
    return { ok: response.status === 204 }
  } catch {
    return { ok: false }
  } finally {
    clearTimeout(timer)
  }
}
