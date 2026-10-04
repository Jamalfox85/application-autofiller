import { readEntitlement } from './entitlementStore.ts'
import type { BillingPlan, CheckoutSource } from './plans.ts'

export interface BillingState {
  ok: boolean
  isPro: boolean
  plan: BillingPlan | null
  fillCount: number
  fillsRemaining: number
  week: string
  extensionPayConfigured: boolean
  error?: string
}

const EMPTY_STATE: BillingState = {
  ok: false,
  isPro: false,
  plan: null,
  fillCount: 0,
  fillsRemaining: 25,
  week: '',
  extensionPayConfigured: false,
}

// When the worker cannot answer, fall back to the cached entitlement so a Pro
// user does not see the Upgrade button for a transient messaging failure.
async function unavailableState(error: string | undefined): Promise<BillingState> {
  const cached = await readEntitlement()
  return { ...EMPTY_STATE, isPro: cached.isPro, plan: cached.plan, error }
}

export async function fetchBillingState(): Promise<BillingState> {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'billing', billingAction: 'getState' })
    if (!response || response.ok === false) return unavailableState(response?.error)
    return response as BillingState
  } catch (error) {
    return unavailableState(error instanceof Error ? error.message : 'billing_unavailable')
  }
}

export async function openProCheckout(input: {
  plan: BillingPlan
  source: CheckoutSource
  fillCount?: number | null
  atsSite?: string | null
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'billing',
      billingAction: 'openCheckout',
      ...input,
    })
    return response ?? { ok: false, error: 'no_response' }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'checkout_failed' }
  }
}

export async function openProLogin(source: CheckoutSource): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'billing',
      billingAction: 'openLogin',
      source,
    })
    return response ?? { ok: false, error: 'no_response' }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'login_failed' }
  }
}
