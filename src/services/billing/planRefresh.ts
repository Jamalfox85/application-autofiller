import { proResumeHeaders, resumeApiBaseUrl } from './proApiContract.ts'

// POST /api/v1/billing/plan/refresh re-verifies Pro with ExtensionPay and writes
// profiles.plan ('pro' or 'free'). It is the only path that downgrades, so locking only
// takes effect after it runs. Call it before list_profiles when the Profiles modal opens and
// before set_active_profile. Any failure (or verified:false) means "keep going with the
// plan the database already has".
export const PLAN_REFRESH_PATH = '/billing/plan/refresh'

// ExtPay.js keeps its per-install key in chrome.storage.sync, falling back to local when
// sync is unavailable (node_modules/extpay/dist/ExtPay.module.js get()/set()).
export const EXTPAY_API_KEY_STORAGE_KEY = 'extensionpay_api_key'

export interface KeyStorageAreas {
  sync?: { get(key: string): Promise<Record<string, unknown>> }
  local?: { get(key: string): Promise<Record<string, unknown>> }
}

export async function readExtPayApiKey(areas: KeyStorageAreas): Promise<string | null> {
  for (const area of [areas.sync, areas.local]) {
    if (!area) continue
    try {
      const data = await area.get(EXTPAY_API_KEY_STORAGE_KEY)
      const value = data[EXTPAY_API_KEY_STORAGE_KEY]
      if (typeof value === 'string' && value.trim()) return value.trim()
    } catch {
      // Try the next area.
    }
  }
  return null
}

export type PlanRefreshResult =
  | { ok: true; plan: 'pro' | 'free'; verified: boolean; changed: boolean }
  | { ok: false; reason: string }

export function parsePlanRefreshBody(status: number, body: unknown): PlanRefreshResult {
  if (status !== 200 || !body || typeof body !== 'object') return { ok: false, reason: `http_${status}` }
  const record = body as { success?: unknown; data?: unknown }
  if (record.success !== true || !record.data || typeof record.data !== 'object') {
    return { ok: false, reason: 'unexpected_body' }
  }
  const data = record.data as { plan?: unknown; verified?: unknown; changed?: unknown }
  if (data.plan !== 'pro' && data.plan !== 'free') return { ok: false, reason: 'unexpected_body' }
  return { ok: true, plan: data.plan, verified: data.verified === true, changed: data.changed === true }
}

export async function postPlanRefresh(input: {
  token: string
  extpayApiKey: string
  baseUrl: string
  apiKey?: string | null
  fetchImpl?: typeof fetch
}): Promise<PlanRefreshResult> {
  const fetchImpl = input.fetchImpl ?? fetch
  try {
    const response = await fetchImpl(`${resumeApiBaseUrl(input.baseUrl)}${PLAN_REFRESH_PATH}`, {
      method: 'POST',
      headers: proResumeHeaders(input.token, input.apiKey),
      body: JSON.stringify({ extpay_api_key: input.extpayApiKey }),
    })
    const raw = await response.text().catch(() => '')
    let parsed: unknown = null
    try {
      parsed = raw ? JSON.parse(raw) : null
    } catch {
      parsed = null
    }
    return parsePlanRefreshBody(response.status, parsed)
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'request_failed' }
  }
}
