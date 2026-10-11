import { planFromExtPayInterval, priceForPlan, type BillingPlan } from './plans.ts'

// ExtPay's onPaid user often has paidAt before plan.interval / nickname.
// pro_purchased has to wait for one of those. The checkout session plan is the
// button that opened the page (usually monthly) and is not the plan that was paid.
export interface ExtPayPurchaseUser {
  paid?: boolean
  paidAt?: Date | string | null
  subscriptionStatus?: string | null
  plan?: { interval?: string | null; nickname?: string | null } | null
}

export interface TrackedPurchase {
  plan: BillingPlan
  paidAt: number | null
  trackedAt: number
}

export interface PurchaseClaim {
  id: string
  plan: BillingPlan
  at: number
}

export interface PurchaseReportStore {
  readTracked(): Promise<TrackedPurchase[]>
  writeTracked(purchases: TrackedPurchase[]): Promise<void>
  readClaim(): Promise<PurchaseClaim | null>
  writeClaim(claim: PurchaseClaim | null): Promise<void>
}

export interface ReportedPurchase {
  plan: BillingPlan
  price: number
  paidAt: number | null
}

export type PurchaseReportStatus = 'tracked' | 'duplicate' | 'unchanged' | 'unresolved' | 'in_flight'

export interface PurchaseReportResult {
  status: PurchaseReportStatus
  plan: BillingPlan | null
  price: number | null
}

// Immediate re-read, then backoff. The waits after the first read sum to 30s.
export const PURCHASE_PLAN_RETRY_DELAYS_MS = [0, 1_000, 2_000, 4_000, 8_000, 15_000] as const

const PURCHASE_CLAIM_MS = 45_000
const TRACKED_PURCHASE_LIMIT = 20
const SAME_PLAN_WINDOW_MS = 24 * 60 * 60 * 1000

export function paidAtMillis(paidAt: Date | string | null | undefined): number | null {
  if (paidAt == null) return null
  if (paidAt instanceof Date) {
    const value = paidAt.getTime()
    return Number.isNaN(value) ? null : value
  }
  if (typeof paidAt !== 'string') return null
  const value = paidAt.trim()
  if (!value || value.toLowerCase() === 'null') return null
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

export function planFromExtPayUser(user: ExtPayPurchaseUser | null | undefined): BillingPlan | null {
  if (!user?.plan) return null
  return planFromExtPayInterval(user.plan.interval, user.plan.nickname ?? null)
}

export function isSameReportedPurchase(
  existing: TrackedPurchase,
  next: { plan: BillingPlan; paidAt: number | null },
  now: number,
): boolean {
  if (existing.plan !== next.plan) return false
  if (existing.paidAt != null && next.paidAt != null) return existing.paidAt === next.paidAt
  const age = now - existing.trackedAt
  return age >= 0 && age < SAME_PLAN_WINDOW_MS
}

export async function reservePurchaseClaim(
  store: PurchaseReportStore,
  plan: BillingPlan,
  now: number,
): Promise<string | null> {
  const existing = await store.readClaim()
  if (existing && now - existing.at >= 0 && now - existing.at < PURCHASE_CLAIM_MS) return null
  const id = `${now.toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  await store.writeClaim({ id, plan, at: now })
  const seen = await store.readClaim()
  return seen?.id === id ? id : null
}

async function commitReportedPurchase(
  input: {
    now: number
    store: PurchaseReportStore
    track: (purchase: ReportedPurchase) => Promise<void>
  },
  resolved: { plan: BillingPlan; paidAt: number | null },
): Promise<PurchaseReportResult> {
  const price = priceForPlan(resolved.plan)
  const history = await input.store.readTracked()
  if (history.some((item) => isSameReportedPurchase(item, resolved, input.now))) {
    return { status: 'duplicate', plan: resolved.plan, price }
  }

  const claimId = await reservePurchaseClaim(input.store, resolved.plan, input.now)
  if (!claimId) return { status: 'in_flight', plan: resolved.plan, price }

  try {
    const again = await input.store.readTracked()
    if (again.some((item) => isSameReportedPurchase(item, resolved, input.now))) {
      return { status: 'duplicate', plan: resolved.plan, price }
    }
    await input.store.writeTracked(
      [...again, { plan: resolved.plan, paidAt: resolved.paidAt, trackedAt: input.now }].slice(
        -TRACKED_PURCHASE_LIMIT,
      ),
    )
    await input.track({ plan: resolved.plan, price, paidAt: resolved.paidAt })
    return { status: 'tracked', plan: resolved.plan, price }
  } finally {
    const current = await input.store.readClaim()
    if (current?.id === claimId) await input.store.writeClaim(null)
  }
}

// Re-read ExtPay, then fall back to the paid-event user. A missing plan stays
// missing for the rest of the backoff instead of becoming monthly.
export async function reportPaidPurchase(input: {
  paidEventUser: ExtPayPurchaseUser | null
  baselinePlan: BillingPlan | null
  waitForChange: boolean
  readUser: () => Promise<ExtPayPurchaseUser | null>
  sleep: (ms: number) => Promise<void>
  now: number
  store: PurchaseReportStore
  track: (purchase: ReportedPurchase) => Promise<void>
  delays?: readonly number[]
}): Promise<PurchaseReportResult> {
  const delays = input.delays ?? PURCHASE_PLAN_RETRY_DELAYS_MS
  const seedPlan = planFromExtPayUser(input.paidEventUser)
  let resolved: { plan: BillingPlan; paidAt: number | null } | null = null

  for (let attempt = 0; attempt < delays.length; attempt++) {
    const wait = delays[attempt] ?? 0
    if (wait > 0) await input.sleep(wait)

    let fresh: ExtPayPurchaseUser | null = null
    try {
      fresh = await input.readUser()
    } catch {
      fresh = null
    }

    const freshPlan = planFromExtPayUser(fresh)
    const plan = freshPlan ?? seedPlan
    if (!plan) continue
    if (input.waitForChange && input.baselinePlan && plan === input.baselinePlan) continue

    const source = freshPlan ? fresh : input.paidEventUser
    resolved = {
      plan,
      paidAt: paidAtMillis(source?.paidAt ?? input.paidEventUser?.paidAt),
    }
    break
  }

  if (!resolved) {
    if (input.waitForChange && input.baselinePlan) {
      return { status: 'unchanged', plan: input.baselinePlan, price: null }
    }
    return { status: 'unresolved', plan: null, price: null }
  }

  return commitReportedPurchase(input, resolved)
}
