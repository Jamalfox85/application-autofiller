import { PENDING_PLAN_KEY } from './entitlementStore.ts'
import { postBillingPlan } from './billingPlan.ts'
import { configuredResumeApiKey, resumeApiBaseUrl } from './proApiContract.ts'

// Local pending plan for offline UX. The entitlement cache is what the popup
// reads before the server answers. profiles.plan is write-locked: only
// service_role can write it, and this client never UPDATEs that column.
// The server plan is set only by POST /api/v1/billing/plan { "plan": "pro" }.

export interface PendingPlanStore {
  get(): Promise<unknown>
  setPro(): Promise<void>
  clear(): Promise<void>
}

function chromePendingStore(): PendingPlanStore {
  return {
    async get() {
      const data = await chrome.storage.local.get(PENDING_PLAN_KEY)
      return data[PENDING_PLAN_KEY]
    },
    async setPro() {
      await chrome.storage.local.set({ [PENDING_PLAN_KEY]: 'pro' })
    },
    async clear() {
      await chrome.storage.local.remove(PENDING_PLAN_KEY)
    },
  }
}

export async function syncProPlanAfterPurchase(options?: {
  fetchImpl?: typeof fetch
  token?: string
  apiKey?: string | null
  baseUrl?: string
  store?: PendingPlanStore
}): Promise<{ ok: boolean; reason?: string }> {
  const store = options?.store ?? chromePendingStore()
  try {
    await store.setPro()
  } catch (error) {
    console.error('[billing] pending plan cache failed', error)
  }

  let token = options?.token
  if (!token) {
    try {
      const { getValidAccessToken } = await import('../../lib/api.ts')
      token = await getValidAccessToken()
    } catch {
      return { ok: false, reason: 'signed_out' }
    }
  }

  const apiKey = configuredResumeApiKey(
    options?.apiKey !== undefined
      ? options.apiKey
      : (import.meta.env.VITE_RESUME_API_KEY as string | undefined),
  )
  if (!apiKey) return { ok: false, reason: 'missing_api_key' }

  try {
    const result = await postBillingPlan({
      token,
      apiKey,
      baseUrl: resumeApiBaseUrl(
        options?.baseUrl ?? (import.meta.env.VITE_RESUME_API_URL as string | undefined),
      ),
      fetchImpl: options?.fetchImpl,
    })
    if (!result.ok) return result
    try {
      await store.clear()
    } catch (error) {
      console.error('[billing] pending plan clear failed', error)
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'request_failed' }
  }
}

// Unpaid ExtPay state drops a queued pro sync. It does not write profiles.plan
// and it does not POST a free plan. The server plan changes only through
// POST /api/v1/billing/plan.
export async function clearPendingProfilePlan(store?: PendingPlanStore): Promise<void> {
  try {
    await (store ?? chromePendingStore()).clear()
  } catch {
    // Local bookkeeping only.
  }
}

export async function flushPendingProfilePlan(options?: {
  fetchImpl?: typeof fetch
  token?: string
  apiKey?: string | null
  baseUrl?: string
  store?: PendingPlanStore
}): Promise<void> {
  const store = options?.store ?? chromePendingStore()
  let pending: unknown
  try {
    pending = await store.get()
  } catch {
    return
  }
  // Older builds queued "free" for a client UPDATE. Drop it locally.
  if (pending === 'free') {
    await clearPendingProfilePlan(store)
    return
  }
  if (pending !== 'pro') return
  await syncProPlanAfterPurchase({ ...options, store })
}
