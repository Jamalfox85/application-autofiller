import { billingCallRecoveringSession } from '../../lib/accessRecovery.ts'
import { PENDING_PLAN_KEY } from './entitlementStore.ts'
import { postBillingPlan } from './billingPlan.ts'
import { configuredResumeApiKey, resumeApiBaseUrl } from './proApiContract.ts'
import { postPlanRefresh, readExtPayApiKey, type KeyStorageAreas } from './planRefresh.ts'

// Local pending plan for offline UX. The entitlement cache is what the popup
// reads before the server answers. profiles.plan is write-locked: only
// service_role can write it, and this client never UPDATEs that column.
// The server plan is set only by POST /api/v1/billing/plan
// { "plan": "pro", "extpay_api_key": "<per-install ExtensionPay key>" }.

export const PURCHASE_VERIFY_NOTICE_KEY = 'purchaseVerifyNotice'
export const PURCHASE_VERIFY_FAILED_COPY = 'Couldn\u2019t verify your purchase. Try again.'

export interface PendingPlanStore {
  get(): Promise<unknown>
  setPro(): Promise<void>
  clear(): Promise<void>
}

export type PlanSyncResult = { ok: true } | { ok: false; reason: string; notice?: string }

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

function chromeKeyAreas(): KeyStorageAreas {
  return {
    sync: chrome.storage?.sync,
    local: chrome.storage?.local,
  }
}

export function purchaseVerifyCopy(reason: string | undefined): string | null {
  if (
    reason === 'receipt_required' ||
    reason === 'purchase_not_verified' ||
    reason === 'could_not_verify' ||
    reason === 'http_400' ||
    reason === 'http_403' ||
    reason === 'http_503'
  ) {
    return PURCHASE_VERIFY_FAILED_COPY
  }
  return null
}

// The notice is a fixed sentence. The install key is never written here.
async function publishPurchaseVerifyNotice(
  reason: string | undefined,
  publish?: (message: string) => Promise<void>,
): Promise<string | undefined> {
  const message = purchaseVerifyCopy(reason)
  if (!message) return undefined
  try {
    if (publish) {
      await publish(message)
    } else {
      const set = globalThis.chrome?.storage?.local?.set
      if (set) await set({ [PURCHASE_VERIFY_NOTICE_KEY]: message })
    }
  } catch {
    // The caller still returns the sentence. Popup startup must not throw.
  }
  return message
}

async function clearPending(store: PendingPlanStore): Promise<void> {
  try {
    await store.clear()
  } catch (error) {
    console.error('[billing] pending plan clear failed', error)
  }
}

function unverified(reason: string, notice: string | undefined): PlanSyncResult {
  return notice ? { ok: false, reason, notice } : { ok: false, reason }
}

export async function syncProPlanAfterPurchase(options?: {
  fetchImpl?: typeof fetch
  token?: string
  apiKey?: string | null
  baseUrl?: string
  extpayApiKey?: string | null
  store?: PendingPlanStore
  readKey?: () => Promise<string | null>
  publishNotice?: (message: string) => Promise<void>
}): Promise<PlanSyncResult> {
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

  const baseUrl = resumeApiBaseUrl(
    options?.baseUrl ?? (import.meta.env.VITE_RESUME_API_URL as string | undefined),
  )

  let extpayApiKey = (options?.extpayApiKey ?? '').trim()
  if (!extpayApiKey && options?.extpayApiKey !== null) {
    try {
      const readKey = options?.readKey ?? (() => readExtPayApiKey(chromeKeyAreas()))
      extpayApiKey = ((await readKey()) ?? '').trim()
    } catch {
      extpayApiKey = ''
    }
  }
  if (!extpayApiKey) {
    const notice = await publishPurchaseVerifyNotice('receipt_required', options?.publishNotice)
    return unverified('receipt_required', notice)
  }

  try {
    const result = await billingCallRecoveringSession(token, (next) =>
      postBillingPlan({
        token: next,
        apiKey,
        baseUrl,
        extpayApiKey,
        fetchImpl: options?.fetchImpl,
      }),
    )
    if (result.ok) {
      await clearPending(store)
      return { ok: true }
    }

    if (result.reason === 'http_400' || result.reason === 'http_403' || result.reason === 'http_503') {
      const refresh = await billingCallRecoveringSession(token, (next) =>
        postPlanRefresh({
          token: next,
          extpayApiKey,
          baseUrl,
          apiKey,
          fetchImpl: options?.fetchImpl,
        }),
      )
      if (refresh.ok && refresh.plan === 'pro' && refresh.verified) {
        await clearPending(store)
        return { ok: true }
      }
      if (refresh.ok && refresh.plan === 'free') {
        await clearPending(store)
        const notice = await publishPurchaseVerifyNotice('purchase_not_verified', options?.publishNotice)
        return unverified('purchase_not_verified', notice)
      }
      // 503 is transient: keep the pending pro so the next sign-in retries.
      // 400/403 are definitive: drop the queued upgrade and stay free.
      if (result.reason === 'http_503') {
        const notice = await publishPurchaseVerifyNotice('could_not_verify', options?.publishNotice)
        return unverified('could_not_verify', notice)
      }
      await clearPending(store)
      const reason = result.reason === 'http_400' ? 'receipt_required' : 'purchase_not_verified'
      const notice = await publishPurchaseVerifyNotice(reason, options?.publishNotice)
      return unverified(reason, notice)
    }

    return result
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
  extpayApiKey?: string | null
  store?: PendingPlanStore
  readKey?: () => Promise<string | null>
  publishNotice?: (message: string) => Promise<void>
}): Promise<PlanSyncResult | void> {
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

  let extpayApiKey = options?.extpayApiKey
  if (extpayApiKey === undefined) {
    try {
      const readKey = options?.readKey ?? (() => readExtPayApiKey(chromeKeyAreas()))
      extpayApiKey = await readKey()
    } catch {
      extpayApiKey = null
    }
  }
  return syncProPlanAfterPurchase({ ...options, extpayApiKey, store })
}
