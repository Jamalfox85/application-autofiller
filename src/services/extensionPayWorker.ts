import ExtPay from 'extpay'
import type { BillingPlan, CheckoutSource } from './billing/plans.ts'
import {
  EXTENSION_PAY_EXTENSION_ID_PLACEHOLDER,
  EXTENSION_PAY_PLAN_SKUS,
  isExtensionPayConfigured,
  planFromExtPayInterval,
  priceForPlan,
} from './billing/plans.ts'
import {
  clearCheckoutSession,
  readCheckoutSession,
  readEntitlement,
  writeCheckoutSession,
  writeEntitlement,
  type CheckoutSession,
} from './billing/entitlementStore.ts'
import { fillsRemaining } from './billing/quota.ts'
import { readFillQuota } from './billing/quotaStore.ts'
import { writeProfilePlan } from './billing/profilePlan.ts'
import {
  PAID_EVENT,
  checkoutAbandonedProps,
  checkoutOpenedProps,
  proPurchasedProps,
} from './billing/paidEvents.ts'
import { paidEventContext, trackPaid } from './billing/trackPaid.ts'

const extensionId = (
  (import.meta.env.VITE_EXTENSIONPAY_EXTENSION_ID as string | undefined) ||
  EXTENSION_PAY_EXTENSION_ID_PLACEHOLDER
).trim()

const configured = isExtensionPayConfigured(extensionId)

function extpay() {
  return ExtPay(extensionId)
}

interface PaidUser {
  paid?: boolean
  plan?: { interval?: string | null; nickname?: string | null; unitAmountCents?: number } | null
}

function planOf(user: PaidUser | null | undefined): BillingPlan | null {
  return planFromExtPayInterval(user?.plan?.interval, user?.plan?.nickname ?? null)
}

async function refreshEntitlement(): Promise<{ isPro: boolean; plan: BillingPlan | null }> {
  const previous = await readEntitlement()
  if (!configured) return previous

  try {
    const user = (await extpay().getUser()) as PaidUser
    const isPro = user?.paid === true
    const plan = isPro ? planOf(user) : null
    await writeEntitlement({ isPro, plan, updatedAt: Date.now() })
    if (isPro && !previous.isPro) await writeProfilePlan('pro')
    if (!isPro && previous.isPro) await writeProfilePlan('free')
    return { isPro, plan }
  } catch (error) {
    console.error('[extpay] getUser failed', error)
    return previous
  }
}

async function onPaid(user: PaidUser): Promise<void> {
  const session = await readCheckoutSession()
  if (session) {
    await writeCheckoutSession({ ...session, completed: true })
  }

  const plan = planOf(user) ?? session?.plan ?? 'monthly'
  await writeEntitlement({ isPro: true, plan, updatedAt: Date.now() })
  await writeProfilePlan('pro')

  const quota = await readFillQuota().catch(() => null)
  const ctx = await paidEventContext({
    atsSite: session?.atsSite,
    fillCount: session?.fillCount ?? quota?.successfulFills ?? null,
  })
  await trackPaid(
    PAID_EVENT.purchased,
    proPurchasedProps({
      ctx,
      plan,
      price: priceForPlan(plan),
      source: session?.source ?? null,
      fillCountAtPurchase: session?.fillCount ?? quota?.successfulFills ?? null,
    }),
  )
  await clearCheckoutSession()
}

function watchCheckoutTab(tabId: number, session: CheckoutSession): void {
  const onRemoved = (closedId: number) => {
    if (closedId !== tabId) return
    chrome.tabs.onRemoved.removeListener(onRemoved)
    void (async () => {
      const current = await readCheckoutSession()
      if (!current || current.openedAt !== session.openedAt || current.completed) return
      try {
        const user = (await extpay().getUser()) as PaidUser
        if (user?.paid) return
      } catch {
        // Treat a failed status check as an abandoned checkout.
      }
      const ctx = await paidEventContext({ atsSite: session.atsSite, fillCount: session.fillCount })
      await trackPaid(
        PAID_EVENT.checkoutAbandoned,
        checkoutAbandonedProps({
          ctx,
          plan: session.plan,
          source: session.source,
          step: 'payment_tab_closed',
        }),
      )
      await clearCheckoutSession()
    })()
  }
  chrome.tabs.onRemoved.addListener(onRemoved)
}

async function rememberCheckoutTab(session: CheckoutSession): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({ url: 'https://extensionpay.com/*' })
    const tab = tabs[tabs.length - 1]
    if (tab?.id != null) watchCheckoutTab(tab.id, session)
  } catch {
    // Checkout still opened. Abandoned is best-effort without the tab id.
  }
}

export function startExtensionPay(): void {
  if (!configured) {
    console.warn(
      '[extpay] VITE_EXTENSIONPAY_EXTENSION_ID is unset or still the placeholder. Checkout is disabled until the ExtensionPay extension id is baked in at build time.',
    )
    return
  }

  try {
    const client = extpay()
    client.startBackground()
    client.onPaid.addListener((user) => {
      void onPaid(user as PaidUser)
    })
  } catch (error) {
    console.error('[extpay] failed to start', error)
  }
}

export async function handleBillingMessage(request: {
  billingAction?: string
  plan?: BillingPlan
  source?: CheckoutSource
  fillCount?: number | null
  atsSite?: string | null
}): Promise<Record<string, unknown>> {
  if (request.billingAction === 'getState') {
    const entitlement = await refreshEntitlement()
    const quota = await readFillQuota()
    return {
      ok: true,
      isPro: entitlement.isPro,
      plan: entitlement.plan,
      fillCount: quota.successfulFills,
      fillsRemaining: fillsRemaining(quota.successfulFills),
      month: quota.month,
      extensionPayConfigured: configured,
    }
  }

  if (request.billingAction === 'openCheckout') {
    const plan = request.plan === 'annual' ? 'annual' : 'monthly'
    const source = request.source
    if (!source) return { ok: false, error: 'missing_source' }
    if (!configured) {
      return {
        ok: false,
        error: 'extensionpay_not_configured',
      }
    }

    const session: CheckoutSession = {
      plan,
      source,
      fillCount: request.fillCount ?? null,
      atsSite: request.atsSite ?? null,
      openedAt: Date.now(),
      completed: false,
    }
    await writeCheckoutSession(session)

    let openedTab = false
    try {
      let before = new Set<number>()
      try {
        before = new Set(
          (await chrome.tabs.query({ url: 'https://extensionpay.com/*' }))
            .map((tab) => tab.id)
            .filter((id): id is number => id != null),
        )
      } catch {
        before = new Set()
      }
      await extpay().openPaymentPage(EXTENSION_PAY_PLAN_SKUS[plan])
      openedTab = true
      try {
        const after = await chrome.tabs.query({ url: 'https://extensionpay.com/*' })
        const created = after.find((tab) => tab.id != null && !before.has(tab.id))
        if (created?.id != null) watchCheckoutTab(created.id, session)
        else await rememberCheckoutTab(session)
      } catch {
        // The payment tab is open. Abandoned tracking is best-effort.
      }
    } catch (error) {
      console.error('[extpay] openPaymentPage failed', error)
      if (!openedTab) {
        await clearCheckoutSession()
        return { ok: false, error: 'checkout_failed' }
      }
    }

    const ctx = await paidEventContext({ atsSite: session.atsSite, fillCount: session.fillCount })
    await trackPaid(PAID_EVENT.checkoutOpened, checkoutOpenedProps({ ctx, plan, source }))
    return { ok: true }
  }

  if (request.billingAction === 'openLogin') {
    if (!configured) return { ok: false, error: 'extensionpay_not_configured' }
    const source = request.source ?? 'hard_cap'
    const session: CheckoutSession = {
      plan: null,
      source,
      fillCount: request.fillCount ?? null,
      atsSite: request.atsSite ?? null,
      openedAt: Date.now(),
      completed: false,
    }
    await writeCheckoutSession(session)
    try {
      await extpay().openLoginPage()
      await rememberCheckoutTab(session)
    } catch (error) {
      console.error('[extpay] openLoginPage failed', error)
      return { ok: false, error: 'login_failed' }
    }
    return { ok: true }
  }

  return { ok: false, error: 'unknown_billing_action' }
}
