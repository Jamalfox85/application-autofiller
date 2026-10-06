import ExtPay from 'extpay'
import type { BillingPlan, CheckoutSource } from './billing/plans.ts'
import {
  EXTENSION_PAY_EXTENSION_ID,
  EXTENSION_PAY_PLAN_SKUS,
  isExtensionPayConfigured,
  isExtPayUserPaid,
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
import { clearPendingProfilePlan, syncProPlanAfterPurchase } from './billing/profilePlan.ts'
import {
  PAID_EVENT,
  checkoutAbandonedProps,
  checkoutOpenedProps,
  proPurchasedProps,
} from './billing/paidEvents.ts'
import { paidEventContext, trackPaid } from './billing/trackPaid.ts'
import { EXTPAY_USER_KEY, resolveIsPro } from './billing/proUnlock.ts'

const extensionId = (
  (import.meta.env.VITE_EXTENSIONPAY_EXTENSION_ID as string | undefined) ||
  EXTENSION_PAY_EXTENSION_ID
).trim()

const configured = isExtensionPayConfigured(extensionId)

const PAID_WATCH_MS = 2 * 60 * 1000

let extPayClient: ReturnType<typeof ExtPay> | null = null
let started = false
let purchaseTracked = false
let watching = false
let watchDeadline = 0
let syncQueue: Promise<void> = Promise.resolve()

function extpay(): ReturnType<typeof ExtPay> {
  if (!extPayClient) extPayClient = ExtPay(extensionId)
  return extPayClient
}

interface PaidUser {
  paid?: boolean
  paidAt?: Date | string | null
  subscriptionStatus?: string | null
  plan?: { interval?: string | null; nickname?: string | null; unitAmountCents?: number } | null
}

function planOf(user: PaidUser | null | undefined): BillingPlan | null {
  return planFromExtPayInterval(user?.plan?.interval, user?.plan?.nickname ?? null)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ExtPay's payment poll is fire-and-forget inside a service worker. A fetch
// plus a Chrome API call on each pass keeps the worker alive until the
// webhook shows the user as paid.
async function keepWorkerAlive(work: () => Promise<void>): Promise<void> {
  let stopped = false
  const beat = () => {
    if (stopped) return
    void chrome.runtime.getPlatformInfo()
  }
  beat()
  const timer = setInterval(beat, 15_000)
  try {
    await work()
  } finally {
    stopped = true
    clearInterval(timer)
  }
}

async function reopenPopupAfterPro(): Promise<void> {
  try {
    const popups = await chrome.runtime.getContexts({ contextTypes: ['POPUP'] })
    if (popups.length > 0) return
    const win = await chrome.windows.getLastFocused({ windowTypes: ['normal'] })
    await chrome.action.openPopup(win?.id ? { windowId: win.id } : undefined)
  } catch (error) {
    console.warn('[extpay] could not reopen the popup', error)
  }
}

async function trackPurchase(user: PaidUser, plan: BillingPlan, session: CheckoutSession | null): Promise<void> {
  if (purchaseTracked) return
  purchaseTracked = true
  if (session && !session.completed) {
    await writeCheckoutSession({ ...session, completed: true })
  }
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

async function syncExtPayUser(user: PaidUser, trustPaidEvent: boolean): Promise<{ isPro: boolean; plan: BillingPlan | null }> {
  const previous = await readEntitlement()
  const now = Date.now()
  const isPro = resolveIsPro(previous, user, now, trustPaidEvent)
  const session = await readCheckoutSession()
  const plan = isPro
    ? (planOf(user) ?? session?.plan ?? previous.plan ?? (trustPaidEvent ? 'monthly' : null))
    : null

  if (isPro === previous.isPro && plan === previous.plan) {
    return { isPro, plan }
  }

  await writeEntitlement({ isPro, plan, updatedAt: now })
  if (isPro && !previous.isPro) {
    await syncProPlanAfterPurchase()
    if (trustPaidEvent || session) await trackPurchase(user, plan ?? 'monthly', session)
    if (session) await reopenPopupAfterPro()
  } else if (!isPro && previous.isPro) {
    await clearPendingProfilePlan()
  }
  return { isPro, plan }
}

function enqueueSync(user: PaidUser, trustPaidEvent: boolean): Promise<{ isPro: boolean; plan: BillingPlan | null }> {
  const run = syncQueue.then(() => syncExtPayUser(user, trustPaidEvent))
  syncQueue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

async function refreshEntitlement(): Promise<{ isPro: boolean; plan: BillingPlan | null }> {
  const previous = await readEntitlement()
  if (!configured) return previous

  try {
    const user = (await extpay().getUser()) as PaidUser
    return await enqueueSync(user, false)
  } catch (error) {
    console.error('[extpay] getUser failed', error)
    return previous
  }
}

function watchUntilPaid(): void {
  if (!configured) return
  watchDeadline = Date.now() + PAID_WATCH_MS
  if (watching) return
  watching = true
  void keepWorkerAlive(async () => {
    while (Date.now() < watchDeadline) {
      try {
        const user = (await extpay().getUser()) as PaidUser
        const result = await enqueueSync(user, false)
        if (result.isPro) return
      } catch (error) {
        console.error('[extpay] paid watch failed', error)
      }
      await delay(1500)
    }
  }).finally(() => {
    watching = false
  })
}

function onExtPayUserStored(
  changes: { [key: string]: chrome.storage.StorageChange },
  area: string,
): void {
  if (area !== 'sync' && area !== 'local') return
  const next = changes[EXTPAY_USER_KEY]?.newValue as PaidUser | undefined
  if (!next || typeof next !== 'object') return
  void enqueueSync(next, false).catch((error) => {
    console.error('[extpay] stored user sync failed', error)
  })
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
        if (isExtPayUserPaid(user)) return
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
  if (started) return
  if (!configured) {
    console.warn(
      '[extpay] VITE_EXTENSIONPAY_EXTENSION_ID is empty. Checkout is disabled.',
    )
    return
  }
  started = true

  try {
    const client = extpay()
    client.startBackground()
    client.onPaid.addListener((user) => {
      void enqueueSync(user as PaidUser, true).catch((error) => {
        console.error('[extpay] onPaid sync failed', error)
      })
    })
  } catch (error) {
    console.error('[extpay] failed to start', error)
  }
  chrome.storage.onChanged.addListener(onExtPayUserStored)

  void refreshEntitlement()
  void readCheckoutSession().then((session) => {
    if (session && !session.completed) watchUntilPaid()
  })
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
      week: quota.week,
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
    watchUntilPaid()
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
    watchUntilPaid()
    return { ok: true }
  }

  return { ok: false, error: 'unknown_billing_action' }
}
