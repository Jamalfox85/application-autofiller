// Verified ExtensionPay dashboard SKUs for gofillr-admin:
//   pro-monthly — $5.99 USD / month
//   pro-yearly  — $49 USD / year
// They are SKU keys, not secrets. Checkout passes the nickname to
// extpay.openPaymentPage(nickname).

// Permanent ExtensionPay extension id for GoFillr. Not a secret. ExtPay mints a
// per-install API key at runtime and stores it in chrome.storage.sync.
export const EXTENSION_PAY_EXTENSION_ID = 'gofillr-admin'

export const EXTENSION_PAY_PLAN_SKUS = {
  monthly: 'pro-monthly',
  annual: 'pro-yearly',
} as const

export const PLAN_PRICE = {
  monthly: 5.99,
  annual: 49,
} as const

export type BillingPlan = keyof typeof EXTENSION_PAY_PLAN_SKUS

export type CheckoutSource = 'soft_gate' | 'hard_cap' | 'resume_ai' | 'multi_profile' | 'match_score' | 'popup'

export type SoftPaywallCta = 'upgrade_monthly' | 'see_annual' | 'continue_free'

export type HardPaywallCta = 'upgrade_monthly' | 'upgrade_annual'

export const FREE_FILL_LIMIT = 25
export const SOFT_GATE_AT = 10

export function isExtensionPayConfigured(extensionId: string | null | undefined): boolean {
  const id = (extensionId ?? '').trim()
  return id.length > 0
}

export function priceForPlan(plan: BillingPlan): number {
  return PLAN_PRICE[plan]
}

export function planFromExtPayInterval(
  interval: string | null | undefined,
  nickname: string | null | undefined,
): BillingPlan | null {
  if (interval === 'year' || nickname === EXTENSION_PAY_PLAN_SKUS.annual) return 'annual'
  if (interval === 'month' || nickname === EXTENSION_PAY_PLAN_SKUS.monthly) return 'monthly'
  return null
}

export interface ExtPayUserStatus {
  paid?: boolean | null
  paidAt?: Date | string | null
  subscriptionStatus?: string | null
}

const LAPSED_SUBSCRIPTION_STATUSES = new Set([
  'past_due',
  'canceled',
  'cancelled',
  'unpaid',
  'incomplete_expired',
])

export function extPaySubscriptionStatus(user: ExtPayUserStatus | null | undefined): string {
  return (user?.subscriptionStatus ?? '').trim().toLowerCase()
}

export function isExtPaySubscriptionLapsed(user: ExtPayUserStatus | null | undefined): boolean {
  return LAPSED_SUBSCRIPTION_STATUSES.has(extPaySubscriptionStatus(user))
}

function paidFlag(user: ExtPayUserStatus): boolean {
  const paid = user.paid as unknown
  return paid === true || paid === 'true'
}

function hasPaidAt(paidAt: ExtPayUserStatus['paidAt']): boolean {
  if (paidAt == null) return false
  if (paidAt instanceof Date) return !Number.isNaN(paidAt.getTime())
  if (typeof paidAt !== 'string') return false
  const value = paidAt.trim()
  return value.length > 0 && value.toLowerCase() !== 'null'
}

// ExtPay fires onPaid on paidAt, but user.paid is true only while a
// subscription's status is exactly "active". Reading paid alone let a refresh
// demote the purchase onPaid had just granted. An active subscription is Pro
// even when that flag and paidAt have not caught up yet. paidAt stays Pro
// unless ExtPay reports the subscription as lapsed.
export function isExtPayUserPaid(user: ExtPayUserStatus | null | undefined): boolean {
  if (!user) return false
  if (paidFlag(user)) return true
  if (extPaySubscriptionStatus(user) === 'active') return true
  if (!hasPaidAt(user.paidAt)) return false
  return !isExtPaySubscriptionLapsed(user)
}
