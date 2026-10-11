import ExtPay from 'extpay'
import type { BillingPlan, CheckoutSource } from './billing/plans.ts'
import {
  EXTENSION_PAY_EXTENSION_ID,
  EXTENSION_PAY_PLAN_SKUS,
  isExtensionPayConfigured,
  isExtPayUserPaid,
  priceForPlan,
} from './billing/plans.ts'
import {
  PURCHASE_PLAN_RETRY_DELAYS_MS,
  paidAtMillis,
  planFromExtPayUser,
  reportPaidPurchase,
  type ExtPayPurchaseUser,
  type PurchaseClaim,
  type PurchaseReportStore,
  type TrackedPurchase,
} from './billing/purchaseReport.ts'
import {
  clearCheckoutSession,
  readCheckoutSession,
  readEntitlement,
  writeCheckoutSession,
  writeEntitlement,
  type CheckoutSession,
} from './billing/entitlementStore.ts'
import { fillsRemaining } from './billing/quota.ts'
import { readAccountFillQuota } from './billing/accountFillQuota.ts'
import { clearPendingProfilePlan, syncProPlanAfterPurchase } from './billing/profilePlan.ts'
import { readExtPayApiKey } from './billing/planRefresh.ts'
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
const PURCHASE_TRACKED_KEY = 'billingPurchaseTracked'
const PURCHASE_CLAIM_KEY = 'billingPurchaseClaim'

let extPayClient: ReturnType<typeof ExtPay> | null = null
let started = false
let watching = false
let watchDeadline = 0
let syncQueue: Promise<void> = Promise.resolve()
let retriedPaymentKey: string | null = null

function extpay(): ReturnType<typeof ExtPay> {
  if (!extPayClient) extPayClient = ExtPay(extensionId)
  return extPayClient
}

type PaidUser = ExtPayPurchaseUser

function isTrackedPurchase(value: unknown): value is TrackedPurchase {
  if (!value || typeof value !== 'object') return false
  const record = value as TrackedPurchase
  return (
    (record.plan === 'monthly' || record.plan === 'annual') &&
    (record.paidAt == null || typeof record.paidAt === 'number') &&
    typeof record.trackedAt === 'number'
  )
}

function isPurchaseClaim(value: unknown): value is PurchaseClaim {
  if (!value || typeof value !== 'object') return false
  const record = value as PurchaseClaim
  return (
    typeof record.id === 'string' &&
    (record.plan === 'monthly' || record.plan === 'annual') &&
    typeof record.at === 'number'
  )
}

function chromePurchaseStore(): PurchaseReportStore {
  return {
    async readTracked() {
      try {
        const data = await chrome.storage.local.get(PURCHASE_TRACKED_KEY)
        const raw = data[PURCHASE_TRACKED_KEY]
        if (!Array.isArray(raw)) return []
        return raw.filter(isTrackedPurchase)
      } catch {
        return []
      }
    },
    async writeTracked(purchases) {
      await chrome.storage.local.set({ [PURCHASE_TRACKED_KEY]: purchases.slice(-20) })
    },
    async readClaim() {
      try {
        const data = await chrome.storage.local.get(PURCHASE_CLAIM_KEY)
        return isPurchaseClaim(data[PURCHASE_CLAIM_KEY]) ? data[PURCHASE_CLAIM_KEY] : null
      } catch {
        return null
      }
    },
    async writeClaim(claim) {
      if (!claim) {
        await chrome.storage.local.remove(PURCHASE_CLAIM_KEY)
        return
      }
      await chrome.storage.local.set({ [PURCHASE_CLAIM_KEY]: claim })
    },
  }
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

async function readExtPayUser(): Promise<PaidUser | null> {
  const user = (await extpay().getUser()) as PaidUser | null
  return user && typeof user === 'object' ? user : null
}

function paymentRetryKey(user: PaidUser, session: CheckoutSession | null): string {
  if (session) return `checkout:${session.openedAt}`
  const paidAt = paidAtMillis(user.paidAt)
  return paidAt == null ? 'paid' : `paid:${paidAt}`
}

async function trackPurchase(plan: BillingPlan, session: CheckoutSession | null): Promise<void> {
  if (session && !session.completed) {
    await writeCheckoutSession({ ...session, completed: true })
  }
  const quota = await readAccountFillQuota().catch(() => null)
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

// Payment is known here, but the ExtPay plan may not be. Re-read getUser and
// keep the worker alive across the backoff. Never bill the session plan.
async function reportPurchaseIfNeeded(
  user: PaidUser,
  previous: { isPro: boolean; plan: BillingPlan | null },
  session: CheckoutSession | null,
  trustPaidEvent: boolean,
  isPro: boolean,
): Promise<void> {
  const explicit = planFromExtPayUser(user)
  const becamePro = isPro && !previous.isPro
  const sessionOpen = !!session && !session.completed
  const paymentSignal = trustPaidEvent || sessionOpen
  const planArrived = explicit != null && explicit !== previous.plan
  // Passive getUser on a reinstall must not invent a purchase. The event waits
  // for onPaid or the checkout that was open when they paid.
  const needsReport =
    paymentSignal && (becamePro || previous.plan == null || planArrived || (trustPaidEvent && explicit == null))
  if (!needsReport) return

  const waitForChange =
    previous.isPro &&
    previous.plan != null &&
    (explicit == null || explicit === previous.plan) &&
    (sessionOpen || (trustPaidEvent && explicit == null))
  const planKnown = explicit != null && (!waitForChange || explicit !== previous.plan)
  const key = paymentRetryKey(user, session)
  const fullRetry = !planKnown && retriedPaymentKey !== key
  if (fullRetry) retriedPaymentKey = key

  const run = () =>
    reportPaidPurchase({
      paidEventUser: user,
      baselinePlan: previous.plan,
      waitForChange,
      readUser: readExtPayUser,
      sleep: delay,
      now: Date.now(),
      store: chromePurchaseStore(),
      delays: fullRetry ? PURCHASE_PLAN_RETRY_DELAYS_MS : [0],
      track: async (purchase) => {
        await writeEntitlement({ isPro: true, plan: purchase.plan, updatedAt: Date.now() })
        await trackPurchase(purchase.plan, await readCheckoutSession())
      },
    })

  let result: Awaited<ReturnType<typeof run>>
  try {
    result = fullRetry ? await keepWorkerAlive(run) : await run()
  } catch (error) {
    if (fullRetry) retriedPaymentKey = null
    throw error
  }
  if (result.status === 'unresolved') {
    console.warn('[extpay] subscription plan is not available yet; pro_purchased was not sent')
  }
  if ((result.status === 'duplicate' || result.status === 'tracked') && result.plan) {
    const current = await readEntitlement()
    if (current.plan !== result.plan || !current.isPro) {
      await writeEntitlement({ isPro: true, plan: result.plan, updatedAt: Date.now() })
    }
  }
  if (result.status === 'duplicate') {
    const currentSession = await readCheckoutSession()
    if (currentSession && !currentSession.completed) await clearCheckoutSession()
  }
}

async function syncExtPayUser(user: PaidUser, trustPaidEvent: boolean): Promise<{ isPro: boolean; plan: BillingPlan | null }> {
  const previous = await readEntitlement()
  const now = Date.now()
  const isPro = resolveIsPro(previous, user, now, trustPaidEvent)
  const session = await readCheckoutSession()
  const explicit = planFromExtPayUser(user)
  // Entitlement may keep the last confirmed plan. It must not pick up the
  // monthly plan stored when the popup opened checkout.
  const plan = isPro ? (explicit ?? previous.plan) : null
  const becamePro = isPro && !previous.isPro

  if (!isPro && !previous.isPro) return { isPro, plan }

  if (isPro !== previous.isPro || plan !== previous.plan) {
    await writeEntitlement({ isPro, plan, updatedAt: now })
  }
  if (becamePro) {
    try {
      const extpayApiKey = await readExtPayApiKey({
        sync: chrome.storage?.sync,
        local: chrome.storage?.local,
      })
      await syncProPlanAfterPurchase({ extpayApiKey })
    } catch (error) {
      console.error('[extpay] plan sync failed', error)
    }
    if (session) await reopenPopupAfterPro()
  } else if (!isPro && previous.isPro) {
    await clearPendingProfilePlan()
  }

  if (isPro) await reportPurchaseIfNeeded(user, previous, session, trustPaidEvent, isPro)

  const latest = await readEntitlement()
  return { isPro: latest.isPro, plan: latest.plan }
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

function purchaseWatchDone(
  result: { isPro: boolean; plan: BillingPlan | null },
  session: CheckoutSession | null,
): boolean {
  if (!result.isPro) return false
  // Leave the watch up while checkout is open so a yearly plan that lands
  // after the first paid read still gets a single pro_purchased.
  if (session && !session.completed) return false
  return result.plan != null
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
        const session = await readCheckoutSession()
        if (purchaseWatchDone(result, session)) return
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
      watchUntilPaid()
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
  if (request.billingAction === 'readFillQuota') {
    const quota = await readAccountFillQuota()
    return { ok: true, quota }
  }

  if (request.billingAction === 'getState') {
    const entitlement = await refreshEntitlement()
    const quota = await readAccountFillQuota()
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
