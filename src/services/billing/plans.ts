// Verified ExtensionPay dashboard SKUs for gofillr:
//   pro_monthly — $5.99 USD / month
//   pro_annual  — $49 USD / year
// They are SKU keys, not secrets. Checkout passes the nickname to
// extpay.openPaymentPage(nickname).

// Permanent ExtensionPay extension id for GoFillr. Not a secret. ExtPay mints a
// per-install API key at runtime and stores it in chrome.storage.sync.
export const EXTENSION_PAY_EXTENSION_ID = 'gofillr'

export const EXTENSION_PAY_PLAN_SKUS = {
  monthly: 'pro_monthly',
  annual: 'pro_annual',
} as const

export const PLAN_PRICE = {
  monthly: 5.99,
  annual: 49,
} as const

export type BillingPlan = keyof typeof EXTENSION_PAY_PLAN_SKUS

export type CheckoutSource = 'soft_gate' | 'hard_cap' | 'resume_ai' | 'multi_profile'

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
