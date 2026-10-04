// Match Score HTTP contract. Field names and enums match the frozen server
// contract. Do not add fields.

export const JD_TEXT_MAX = 30_000
export const MATCH_SCORE_TIMEOUT_MS = 8_000

export const MATCH_ATS = [
  'greenhouse',
  'ashby',
  'lever',
  'jobvite',
  'workable',
  'bamboohr',
  'icims',
  'workday',
] as const

export type MatchAts = (typeof MATCH_ATS)[number]

export type JdSource = 'dom' | 'fetched'

export interface MatchExperience {
  job_title: string
  company_name: string
  start_date: string
  end_date: string
  present: boolean
  description: string
}

export interface MatchEducation {
  degree_type: string
  major: string
  graduation_year: string
}

export interface MatchProfile {
  skills: string[]
  experience: MatchExperience[]
  education: MatchEducation[]
  location: { city: string; state: string; country: string }
  work_authorization: string
  sponsorship_required: string
}

export interface MatchScoreRequest {
  job_url: string
  ats: MatchAts
  jd_text: string
  jd_source: JdSource
  profile: MatchProfile
}

export type MatchBand = 'very_strong' | 'good' | 'okay' | 'weak'
export type MatchConfidence = 'high' | 'low'
export type MatchedKind = 'must' | 'nice'
export type SuggestionKind = 'must' | 'years' | 'nice' | 'education'
export type DealbreakerType = 'sponsorship' | 'location'
export type NoticeType = 'clearance' | 'license'
export type MissingProfile = 'skills' | 'experience_descriptions'
export type UnsupportedReason = 'non_english' | 'jd_too_short'

export interface QuickAnswer {
  skill: string
  question: string
}

export interface MatchedItem {
  label: string
  kind: MatchedKind
}

export interface Suggestion {
  id: string
  kind: SuggestionKind
  text: string
  quick_answer?: QuickAnswer
}

export interface Dealbreaker {
  type: DealbreakerType
  text: string
}

export interface Notice {
  type: NoticeType
  text: string
}

export interface ScoredMatch {
  status: 'scored'
  score: number
  band: MatchBand
  confidence: MatchConfidence
  strong_match: boolean
  matched: MatchedItem[]
  suggestions: Suggestion[]
  dealbreakers: Dealbreaker[]
  notices: Notice[]
  score_version: number
  requirements_version: number
  cached_requirements: boolean
}

export type MatchScoreResult =
  | { kind: 'scored'; score: ScoredMatch }
  | { kind: 'insufficient_profile'; missing: MissingProfile[] }
  | { kind: 'unsupported'; reason: UnsupportedReason }
  | { kind: 'plan_required' }
  | { kind: 'rate_limited' }
  | { kind: 'unauthorized' }
  | { kind: 'hide' }

export const BAND_LABEL: Record<MatchBand, string> = {
  very_strong: 'Very strong',
  good: 'Good',
  okay: 'Okay',
  weak: 'Weak',
}

export const STRONG_MATCH_COPY = "You're a strong match"
export const INSUFFICIENT_COPY = 'Complete your profile to get a Match Score'
export const MATCH_SCORE_FOOTNOTE = 'Scored against your GoFillr profile, not your resume file'
export const MATCH_SCORE_LOADING = 'Checking match…'

export function isMatchAts(value: string): value is MatchAts {
  return (MATCH_ATS as readonly string[]).includes(value)
}

export function quickAnswerFor(suggestion: Suggestion): QuickAnswer | null {
  if (suggestion.kind !== 'must' && suggestion.kind !== 'nice') return null
  const answer = suggestion.quick_answer
  if (!answer) return null
  const skill = answer.skill.trim()
  const question = answer.question.trim()
  if (!skill || !question) return null
  return { skill, question }
}
