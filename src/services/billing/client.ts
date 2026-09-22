import type { BillingPlan, CheckoutSource } from './plans.ts'

export interface BillingState {
  ok: boolean
  isPro: boolean
  plan: BillingPlan | null
  fillCount: number
  fillsRemaining: number
  month: string
  extensionPayConfigured: boolean
  error?: string
}

const EMPTY_STATE: BillingState = {
  ok: false,
  isPro: false,
  plan: null,
  fillCount: 0,
  fillsRemaining: 25,
  month: '',
  extensionPayConfigured: false,
}

export async function fetchBillingState(): Promise<BillingState> {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'billing', billingAction: 'getState' })
    if (!response || response.ok === false) return { ...EMPTY_STATE, error: response?.error }
    return response as BillingState
  } catch (error) {
    return { ...EMPTY_STATE, error: error instanceof Error ? error.message : 'billing_unavailable' }
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
