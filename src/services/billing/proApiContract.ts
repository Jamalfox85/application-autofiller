import { isPlanRequiredResponse } from './planRequired.ts'

// Backend draft (resume-api#48). Product name for generate is "tailor" — there is
// no separate tailor route. Upload/parse is not in this map and stays ungated.
// Fill quota never calls these routes.
//
// The API's ENFORCE_PLAN_GATE flag defaults to false. While it is off these POSTs
// still succeed without a pro row. When it is on, both routes require
// Authorization: Bearer <supabase access token> and profiles.plan = pro, and
// otherwise return 403 plan_required. This client always sends the Bearer token
// and turns that 403 into the resume Pro gate.
export const PRO_RESUME_PATHS = {
  generate: '/resumes/generate',
  analyze: '/ats/analyze',
} as const

export type ProResumeAction = keyof typeof PRO_RESUME_PATHS

const API_KEY_PLACEHOLDER = 'your-resume-api-key'

export function resumeApiBaseUrl(configured: string | null | undefined): string {
  const value = (configured ?? '').trim().replace(/\/$/, '')
  return value || 'http://localhost:8080/api/v1'
}

// Bearer is the Supabase user access token. X-API-Key is included only when the
// build provides a non-placeholder VITE_RESUME_API_KEY. Upload/parse does not use this.
export function proResumeHeaders(token: string, apiKey: string | null | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }
  const key = (apiKey ?? '').trim()
  if (key && key !== API_KEY_PLACEHOLDER) {
    headers['X-API-Key'] = key
  }
  return headers
}

export type ProResumeResult =
  | { ok: true; data: unknown }
  | { ok: false; gate: 'resume_ai' }
  | { ok: false; message: string }

export function summarizeProData(data: unknown): string {
  if (!data || typeof data !== 'object') return 'Done.'
  const record = data as Record<string, unknown>
  const score = record.score ?? record.ats_score
  if (typeof score === 'number') return `ATS score: ${score}`
  for (const key of ['summary', 'text', 'content', 'tailored_resume']) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 600)
  }
  return 'Done.'
}

export async function postProResume(input: {
  action: ProResumeAction
  body: Record<string, unknown>
  token: string
  baseUrl: string
  apiKey?: string | null
  fetchImpl?: typeof fetch
}): Promise<ProResumeResult> {
  const fetchImpl = input.fetchImpl ?? fetch
  const response = await fetchImpl(`${resumeApiBaseUrl(input.baseUrl)}${PRO_RESUME_PATHS[input.action]}`, {
    method: 'POST',
    headers: proResumeHeaders(input.token, input.apiKey),
    body: JSON.stringify(input.body),
  })

  let parsed: unknown = null
  const raw = await response.text()
  if (raw) {
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = null
    }
  }

  if (isPlanRequiredResponse(response.status, parsed)) {
    return { ok: false, gate: 'resume_ai' }
  }

  if (!response.ok) {
    const message =
      parsed && typeof parsed === 'object' && typeof (parsed as { error?: unknown }).error === 'string'
        ? (parsed as { error: string }).error
        : `Request failed (${response.status}).`
    return { ok: false, message }
  }

  const data =
    parsed && typeof parsed === 'object' && 'data' in parsed ? (parsed as { data: unknown }).data : parsed
  return { ok: true, data }
}
