import { ENTITLEMENT_KEY } from './entitlementStore.ts'
import {
  FREE_FILL_LIMIT,
  isExtPaySubscriptionLapsed,
  isExtPayUserPaid,
  type BillingPlan,
  type ExtPayUserStatus,
} from './plans.ts'

// ExtPay's own cache. Written by getUser() into chrome.storage.sync (local if
// sync is unavailable). Watching it lets the popup and the page react when
// ExtensionPay learns about a payment, without reloading Chrome.
export const EXTPAY_USER_KEY = 'extensionpay_user'

// A payment webhook can land after onPaid. Keep the Pro grant across that gap
// so a lagging unpaid read does not put the 25-fill cap back.
export const PAID_SYNC_GRACE_MS = 2 * 60 * 1000

export function fillQuotaNote(isPro: boolean, fillCount: number): string {
  if (isPro) return 'Pro · unlimited fills'
  return `${fillCount} of ${FREE_FILL_LIMIT} free fills this week`
}

export function entitlementFromStorage(
  value: unknown,
): { isPro: boolean; plan: BillingPlan | null } | null {
  if (!value || typeof value !== 'object') return null
  const record = value as { isPro?: unknown; plan?: unknown }
  if (typeof record.isPro !== 'boolean') return null
  const plan = record.plan === 'monthly' || record.plan === 'annual' ? record.plan : null
  return { isPro: record.isPro, plan }
}

export function applyEntitlementToBilling<T extends { isPro: boolean; plan: BillingPlan | null }>(
  current: T,
  stored: unknown,
): T {
  const next = entitlementFromStorage(stored)
  if (!next) return current
  if (current.isPro === next.isPro && current.plan === next.plan) return current
  return { ...current, isPro: next.isPro, plan: next.plan }
}

export function resolveIsPro(
  previous: { isPro: boolean; updatedAt: number },
  user: ExtPayUserStatus | null | undefined,
  now: number,
  trustPaidEvent = false,
): boolean {
  if (trustPaidEvent || isExtPayUserPaid(user)) return true
  if (!previous.isPro) return false
  if (isExtPaySubscriptionLapsed(user)) return false
  const age = now - previous.updatedAt
  return age >= 0 && age < PAID_SYNC_GRACE_MS
}

export type ProUnlockAction = 'resume' | 'dismiss' | 'none'

// Free → Pro while this page is sitting on the cap. Resume only the fill that
// was blocked. A page that was not gated must not autofill on its own.
export function proUnlockAction(input: {
  previousIsPro: boolean
  nextIsPro: boolean
  hardPaywallOpen: boolean
  paywallOpen: boolean
  blockedByCap: boolean
}): ProUnlockAction {
  if (!input.nextIsPro || input.previousIsPro) return 'none'
  if (input.hardPaywallOpen || input.blockedByCap) return 'resume'
  if (input.paywallOpen) return 'dismiss'
  return 'none'
}

export function dismissFillPaywall(doc: Document): void {
  doc.querySelectorAll('.gofillr-paywall, .gofillr-paywall-card').forEach((node) => node.remove())
}

let blockedByCap = false
let installed = false

export function rememberFillBlock(result: { code?: string; paywall?: string | null } | null | undefined): void {
  if (result?.code === 'hard_cap' || result?.paywall === 'hard') blockedByCap = true
}

export function installProUnlock(resumeAutofill: () => Promise<unknown>): void {
  if (installed) return
  installed = true
  if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) return
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return
    const change = changes[ENTITLEMENT_KEY]
    if (!change) return
    const nextIsPro = change.newValue?.isPro === true
    const previousIsPro = change.oldValue?.isPro === true
    const hardPaywallOpen = !!document.querySelector('[data-paywall="hard"]')
    const paywallOpen = !!document.querySelector('.gofillr-paywall, .gofillr-paywall-card')
    const action = proUnlockAction({
      previousIsPro,
      nextIsPro,
      hardPaywallOpen,
      paywallOpen,
      blockedByCap,
    })
    if (action === 'none') return
    dismissFillPaywall(document)
    blockedByCap = false
    if (action === 'resume') void resumeAutofill()
  })
}
