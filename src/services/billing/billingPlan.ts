import { configuredResumeApiKey, resumeApiBaseUrl } from './proApiContract.ts'

// Server plan is written only here. The extension does not UPDATE profiles.plan.
export const BILLING_PLAN_PATH = '/billing/plan'

export function billingPlanHeaders(token: string, apiKey: string): Record<string, string> {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'X-API-Key': apiKey,
  }
}

export function isProBillingPlanSuccess(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false
  const record = body as { success?: unknown; data?: unknown }
  if (record.success !== true || !record.data || typeof record.data !== 'object') return false
  return (record.data as { plan?: unknown }).plan === 'pro'
}

export async function postBillingPlan(input: {
  token: string
  apiKey: string
  baseUrl: string
  fetchImpl?: typeof fetch
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const apiKey = configuredResumeApiKey(input.apiKey)
  if (!apiKey) return { ok: false, reason: 'missing_api_key' }

  const fetchImpl = input.fetchImpl ?? fetch
  const response = await fetchImpl(`${resumeApiBaseUrl(input.baseUrl)}${BILLING_PLAN_PATH}`, {
    method: 'POST',
    headers: billingPlanHeaders(input.token, apiKey),
    body: JSON.stringify({ plan: 'pro' }),
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

  if (response.ok && isProBillingPlanSuccess(parsed)) return { ok: true }
  return { ok: false, reason: response.ok ? 'unexpected_body' : `http_${response.status}` }
}
