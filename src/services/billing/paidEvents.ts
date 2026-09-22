import type { BillingPlan, CheckoutSource, HardPaywallCta, SoftPaywallCta } from './plans.ts'

// Conversion-locked Mixpanel names. Do not rename.
export const PAID_EVENT = {
  softShown: 'soft_paywall_shown',
  softCta: 'soft_paywall_cta_clicked',
  softDismissed: 'soft_paywall_dismissed',
  hardShown: 'hard_paywall_shown',
  hardCta: 'hard_paywall_cta_clicked',
  hardDismissed: 'hard_paywall_dismissed',
  surfaceShown: 'pro_surface_gate_shown',
  surfaceCta: 'pro_surface_gate_cta_clicked',
  checkoutOpened: 'checkout_opened',
  checkoutAbandoned: 'checkout_abandoned',
  purchased: 'pro_purchased',
} as const

export type ProSurface = 'resume_ai' | 'multi_profile'
export type BuildChannel = 'draft' | 'cws'

export interface PaidEventContext {
  distinctId?: string | null
  userId?: string | null
  extensionVersion?: string | null
  buildChannel?: BuildChannel | null
  atsSite?: string | null
  fillCount?: number | null
}

export function buildChannelFromInstallSource(installSource: string | null | undefined): BuildChannel {
  return installSource === 'chrome_web_store' ? 'cws' : 'draft'
}

export function sharedPaidProps(ctx: PaidEventContext): Record<string, unknown> {
  return {
    distinct_id: ctx.distinctId || undefined,
    user_id: ctx.userId || undefined,
    extension_version: ctx.extensionVersion || undefined,
    build_channel: ctx.buildChannel || undefined,
  }
}

export function softPaywallShownProps(
  ctx: PaidEventContext & { fillCount: number; fillsRemaining: number },
): Record<string, unknown> {
  return {
    ...sharedPaidProps(ctx),
    fill_count: ctx.fillCount,
    fills_remaining: ctx.fillsRemaining,
    ats_site: ctx.atsSite || 'other',
    plan_shown_default: 'monthly',
    trigger: 'fill_threshold',
    is_first_fill: false,
  }
}

export function softPaywallCtaProps(
  ctx: PaidEventContext & { fillCount: number; fillsRemaining: number; cta: SoftPaywallCta },
): Record<string, unknown> {
  return {
    ...sharedPaidProps(ctx),
    cta: ctx.cta,
    fill_count: ctx.fillCount,
    fills_remaining: ctx.fillsRemaining,
    ats_site: ctx.atsSite || 'other',
    is_first_fill: false,
  }
}

export function softPaywallDismissedProps(
  ctx: PaidEventContext & { fillCount: number; fillsRemaining: number },
): Record<string, unknown> {
  return {
    ...sharedPaidProps(ctx),
    fill_count: ctx.fillCount,
    fills_remaining: ctx.fillsRemaining,
    ats_site: ctx.atsSite || 'other',
    is_first_fill: false,
  }
}

export function hardPaywallShownProps(ctx: PaidEventContext & { fillCount: number }): Record<string, unknown> {
  return {
    ...sharedPaidProps(ctx),
    fill_count: ctx.fillCount,
    ats_site: ctx.atsSite || 'other',
    plan_shown_default: 'monthly',
    is_first_fill: false,
  }
}

export function hardPaywallCtaProps(
  ctx: PaidEventContext & { fillCount: number; cta: HardPaywallCta },
): Record<string, unknown> {
  return {
    ...sharedPaidProps(ctx),
    cta: ctx.cta,
    fill_count: ctx.fillCount,
    ats_site: ctx.atsSite || 'other',
    is_first_fill: false,
  }
}

export function hardPaywallDismissedProps(ctx: PaidEventContext & { fillCount: number }): Record<string, unknown> {
  return {
    ...sharedPaidProps(ctx),
    fill_count: ctx.fillCount,
    ats_site: ctx.atsSite || 'other',
    is_first_fill: false,
  }
}

export function surfaceShownProps(ctx: PaidEventContext & { surface: ProSurface }): Record<string, unknown> {
  return {
    ...sharedPaidProps(ctx),
    surface: ctx.surface,
    ats_site: ctx.atsSite || undefined,
  }
}

export function surfaceCtaProps(ctx: PaidEventContext & { surface: ProSurface }): Record<string, unknown> {
  return {
    ...sharedPaidProps(ctx),
    surface: ctx.surface,
    cta: 'upgrade',
    ats_site: ctx.atsSite || undefined,
  }
}

export function checkoutOpenedProps(input: {
  ctx: PaidEventContext
  plan: BillingPlan
  source: CheckoutSource
}): Record<string, unknown> {
  return {
    ...sharedPaidProps(input.ctx),
    plan: input.plan,
    source: input.source,
    ats_site: input.ctx.atsSite || undefined,
  }
}

export function checkoutAbandonedProps(input: {
  ctx: PaidEventContext
  plan: BillingPlan | null
  source: CheckoutSource
  step?: string | null
}): Record<string, unknown> {
  return {
    ...sharedPaidProps(input.ctx),
    plan: input.plan || undefined,
    source: input.source,
    step: input.step || undefined,
    ats_site: input.ctx.atsSite || undefined,
  }
}

export function proPurchasedProps(input: {
  ctx: PaidEventContext
  plan: BillingPlan
  price: number
  source?: CheckoutSource | null
  fillCountAtPurchase?: number | null
}): Record<string, unknown> {
  return {
    ...sharedPaidProps(input.ctx),
    plan: input.plan,
    price: input.price,
    source: input.source || undefined,
    fill_count_at_purchase: input.fillCountAtPurchase ?? undefined,
    ats_site: input.ctx.atsSite || undefined,
  }
}
