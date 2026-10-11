import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { proPurchasedProps } from './paidEvents.ts'
import { priceForPlan } from './plans.ts'
import {
  PURCHASE_PLAN_RETRY_DELAYS_MS,
  planFromExtPayUser,
  reportPaidPurchase,
  reservePurchaseClaim,
  type ExtPayPurchaseUser,
  type PurchaseClaim,
  type PurchaseReportStore,
  type ReportedPurchase,
  type TrackedPurchase,
} from './purchaseReport.ts'

const YEARLY_AT = '2026-10-11T02:00:00.000Z'
const NOW = Date.parse('2026-10-11T02:00:05.000Z')

function user(plan: ExtPayPurchaseUser['plan'], paidAt: string | null = YEARLY_AT): ExtPayPurchaseUser {
  return { paid: true, paidAt, plan }
}

function memoryStore(shared?: { tracked: TrackedPurchase[]; claim: PurchaseClaim | null }): PurchaseReportStore & {
  tracked: TrackedPurchase[]
} {
  const state = shared ?? { tracked: [] as TrackedPurchase[], claim: null as PurchaseClaim | null }
  return {
    tracked: state.tracked,
    async readTracked() {
      return state.tracked.map((item) => ({ ...item }))
    },
    async writeTracked(purchases) {
      state.tracked = purchases.map((item) => ({ ...item }))
    },
    async readClaim() {
      return state.claim ? { ...state.claim } : null
    },
    async writeClaim(claim) {
      state.claim = claim ? { ...claim } : null
    },
  }
}

function queuedStore(): PurchaseReportStore {
  let tracked: TrackedPurchase[] = []
  let claim: PurchaseClaim | null = null
  let chain: Promise<void> = Promise.resolve()
  const run = <T>(fn: () => T | Promise<T>): Promise<T> => {
    const next = chain.then(fn, fn)
    chain = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }
  return {
    readTracked: () => run(() => tracked.map((item) => ({ ...item }))),
    writeTracked: (items) =>
      run(() => {
        tracked = items.map((item) => ({ ...item }))
      }),
    readClaim: () => run(() => (claim ? { ...claim } : null)),
    writeClaim: (next) =>
      run(() => {
        claim = next ? { ...next } : null
      }),
  }
}

test('ExtPay interval and nickname map to the billing plan', () => {
  assert.equal(planFromExtPayUser(user({ interval: 'year' })), 'annual')
  assert.equal(planFromExtPayUser(user({ nickname: 'pro-yearly' })), 'annual')
  assert.equal(planFromExtPayUser(user({ interval: 'year', nickname: 'pro-yearly' })), 'annual')
  assert.equal(planFromExtPayUser(user({ interval: 'month' })), 'monthly')
  assert.equal(planFromExtPayUser(user({ nickname: 'pro-monthly' })), 'monthly')
  assert.equal(planFromExtPayUser(user(null)), null)
  assert.equal(planFromExtPayUser(user({ nickname: 'something-else' })), null)
})

test('plan retry backs off for 30 seconds and does not default the wait to zero', () => {
  const waits = PURCHASE_PLAN_RETRY_DELAYS_MS.filter((ms) => ms > 0)
  assert.equal(PURCHASE_PLAN_RETRY_DELAYS_MS[0], 0)
  assert.ok(waits.length >= 3)
  assert.equal(
    waits.reduce((sum, ms) => sum + ms, 0),
    30_000,
  )
  for (let i = 1; i < waits.length; i++) assert.ok(waits[i] >= waits[i - 1])
})

test('yearly paid with user.plan present reports annual at the yearly price', async () => {
  const events: ReportedPurchase[] = []
  const reads: number[] = []
  const yearly = user({ interval: 'year', nickname: 'pro-yearly' })
  const result = await reportPaidPurchase({
    paidEventUser: yearly,
    baselinePlan: null,
    waitForChange: false,
    readUser: async () => {
      reads.push(reads.length)
      return yearly
    },
    sleep: async () => {
      throw new Error('plan was already on the ExtPay user')
    },
    now: NOW,
    store: memoryStore(),
    delays: PURCHASE_PLAN_RETRY_DELAYS_MS,
    track: async (purchase) => {
      events.push(purchase)
    },
  })

  assert.equal(result.status, 'tracked')
  assert.equal(result.plan, 'annual')
  assert.equal(result.price, priceForPlan('annual'))
  assert.equal(result.price, 49)
  assert.equal(events.length, 1)
  assert.equal(events[0].plan, 'annual')
  assert.equal(events[0].price, 49)
  assert.equal(reads.length, 1)

  const props = proPurchasedProps({
    ctx: {
      buildChannel: 'draft',
      distinctId: 'install-1',
      extensionVersion: '2.0.0',
      atsSite: 'greenhouse',
      fillCount: 4,
    },
    plan: events[0].plan,
    price: events[0].price,
    source: 'popup',
    fillCountAtPurchase: 4,
  })
  assert.equal(props.plan, 'annual')
  assert.equal(props.price, 49)
  assert.equal(props.source, 'popup')
  assert.equal(props.build_channel, 'draft')
  assert.equal(props.fill_count_at_purchase, 4)
})

test('yearly paid where user.plan arrives late waits and then reports 49', async () => {
  const events: ReportedPurchase[] = []
  const sleeps: number[] = []
  let reads = 0
  const scripted = [
    user(null),
    user({}),
    user({ interval: 'year' }),
  ]
  const result = await reportPaidPurchase({
    paidEventUser: user(null),
    baselinePlan: null,
    waitForChange: false,
    readUser: async () => {
      const next = scripted[Math.min(reads, scripted.length - 1)]
      reads += 1
      return next
    },
    sleep: async (ms) => {
      sleeps.push(ms)
      assert.equal(events.length, 0)
    },
    now: NOW,
    store: memoryStore(),
    delays: [0, 1_000, 2_000, 4_000],
    track: async (purchase) => {
      events.push(purchase)
    },
  })

  assert.deepEqual(sleeps, [1_000, 2_000])
  assert.equal(reads, 3)
  assert.equal(result.status, 'tracked')
  assert.equal(events.length, 1)
  assert.equal(events[0].plan, 'annual')
  assert.equal(events[0].price, priceForPlan('annual'))
  assert.equal(events[0].price, 49)
  assert.notEqual(events[0].price, priceForPlan('monthly'))
})

test('monthly paid reports monthly at 5.99', async () => {
  const events: ReportedPurchase[] = []
  const result = await reportPaidPurchase({
    paidEventUser: user({ interval: 'month', nickname: 'pro-monthly' }, '2026-10-11T03:00:00.000Z'),
    baselinePlan: null,
    waitForChange: false,
    readUser: async () => user({ nickname: 'pro-monthly' }, '2026-10-11T03:00:00.000Z'),
    sleep: async () => {
      throw new Error('monthly plan was already present')
    },
    now: NOW,
    store: memoryStore(),
    delays: [0],
    track: async (purchase) => {
      events.push(purchase)
    },
  })

  assert.equal(result.status, 'tracked')
  assert.equal(result.plan, 'monthly')
  assert.equal(result.price, priceForPlan('monthly'))
  assert.equal(result.price, 5.99)
  assert.equal(events.length, 1)
  assert.equal(events[0].plan, 'monthly')
  assert.equal(events[0].price, 5.99)
})

test('plan unknown stays unreported, then a later read reports the real plan once', async () => {
  const events: ReportedPurchase[] = []
  const store = memoryStore()
  const sleeps: number[] = []
  const pending = await reportPaidPurchase({
    paidEventUser: user(null),
    baselinePlan: null,
    waitForChange: false,
    readUser: async () => user(null),
    sleep: async (ms) => {
      sleeps.push(ms)
    },
    now: NOW,
    store,
    delays: [0, 10, 20],
    track: async (purchase) => {
      events.push(purchase)
    },
  })

  assert.equal(pending.status, 'unresolved')
  assert.equal(pending.plan, null)
  assert.equal(pending.price, null)
  assert.equal(events.length, 0)
  assert.deepEqual(sleeps, [10, 20])
  assert.equal(store.tracked.length, 0)

  const resolved = await reportPaidPurchase({
    paidEventUser: user(null),
    baselinePlan: null,
    waitForChange: false,
    readUser: async () => user({ nickname: 'pro-yearly' }),
    sleep: async () => {
      throw new Error('the late plan was on the first re-read')
    },
    now: NOW + 60_000,
    store,
    delays: [0],
    track: async (purchase) => {
      events.push(purchase)
    },
  })

  assert.equal(resolved.status, 'tracked')
  assert.equal(events.length, 1)
  assert.equal(events[0].plan, 'annual')
  assert.equal(events[0].price, 49)
})

test('a monthly checkout session never prices a missing ExtPay plan as 5.99', async () => {
  const events: ReportedPurchase[] = []
  const result = await reportPaidPurchase({
    // Popup opened monthly checkout. ExtPay has not echoed pro-yearly yet.
    paidEventUser: { paid: true, paidAt: YEARLY_AT, plan: null },
    baselinePlan: null,
    waitForChange: false,
    readUser: async () => ({ paid: true, paidAt: YEARLY_AT, plan: null }),
    sleep: async () => {},
    now: NOW,
    store: memoryStore(),
    delays: [0, 5],
    track: async (purchase) => {
      events.push(purchase)
    },
  })

  assert.equal(result.status, 'unresolved')
  assert.equal(events.length, 0)
  assert.notEqual(result.plan, 'monthly')
  assert.notEqual(result.price, 5.99)
})

test('monthly purchase then a later upgrade to yearly reports both plans once', async () => {
  const events: ReportedPurchase[] = []
  const store = memoryStore()
  const monthly = await reportPaidPurchase({
    paidEventUser: user({ interval: 'month' }, '2026-10-01T00:00:00.000Z'),
    baselinePlan: null,
    waitForChange: false,
    readUser: async () => user({ nickname: 'pro-monthly' }, '2026-10-01T00:00:00.000Z'),
    sleep: async () => {},
    now: Date.parse('2026-10-01T00:00:02.000Z'),
    store,
    delays: [0],
    track: async (purchase) => {
      events.push(purchase)
    },
  })
  assert.equal(monthly.status, 'tracked')

  const reads = [
    user({ interval: 'month' }, '2026-10-01T00:00:00.000Z'),
    user({ interval: 'month', nickname: 'pro-monthly' }, '2026-10-01T00:00:00.000Z'),
    user({ interval: 'year', nickname: 'pro-yearly' }, '2026-10-11T04:00:00.000Z'),
  ]
  let index = 0
  const upgraded = await reportPaidPurchase({
    paidEventUser: user(null, '2026-10-11T04:00:00.000Z'),
    baselinePlan: 'monthly',
    waitForChange: true,
    readUser: async () => reads[Math.min(index++, reads.length - 1)],
    sleep: async () => {},
    now: Date.parse('2026-10-11T04:00:10.000Z'),
    store,
    delays: [0, 5, 5],
    track: async (purchase) => {
      events.push(purchase)
    },
  })

  assert.equal(upgraded.status, 'tracked')
  assert.equal(upgraded.plan, 'annual')
  assert.equal(upgraded.price, 49)
  assert.equal(events.length, 2)
  assert.deepEqual(
    events.map((event) => [event.plan, event.price]),
    [
      ['monthly', 5.99],
      ['annual', 49],
    ],
  )

  const again = await reportPaidPurchase({
    paidEventUser: user({ interval: 'year', nickname: 'pro-yearly' }, '2026-10-11T04:00:00.000Z'),
    baselinePlan: 'annual',
    waitForChange: false,
    readUser: async () => user({ interval: 'year' }, '2026-10-11T04:00:00.000Z'),
    sleep: async () => {},
    now: Date.parse('2026-10-11T04:01:00.000Z'),
    store,
    delays: [0],
    track: async (purchase) => {
      events.push(purchase)
    },
  })
  assert.equal(again.status, 'duplicate')
  assert.equal(events.length, 2)
})

test('no duplicate events across two reporters sharing the purchase store', async () => {
  const shared = { tracked: [] as TrackedPurchase[], claim: null as PurchaseClaim | null }
  const events: ReportedPurchase[] = []
  const yearly = user({ interval: 'year', nickname: 'pro-yearly' })
  const report = () =>
    reportPaidPurchase({
      paidEventUser: yearly,
      baselinePlan: null,
      waitForChange: false,
      readUser: async () => yearly,
      sleep: async () => {},
      now: NOW,
      store: memoryStore(shared),
      delays: [0],
      track: async (purchase) => {
        events.push(purchase)
      },
    })

  const first = await report()
  const second = await report()
  assert.equal(first.status, 'tracked')
  assert.equal(second.status, 'duplicate')
  assert.equal(events.length, 1)
  assert.equal(events[0].plan, 'annual')
  assert.equal(events[0].price, 49)
  assert.equal(shared.tracked.length, 1)
})

test('overlapping reporters fire pro_purchased once', async () => {
  const store = queuedStore()
  const events: ReportedPurchase[] = []
  const yearly = user({ interval: 'year', nickname: 'pro-yearly' })
  const run = () =>
    reportPaidPurchase({
      paidEventUser: yearly,
      baselinePlan: null,
      waitForChange: false,
      readUser: async () => yearly,
      sleep: async () => {},
      now: NOW,
      store,
      delays: [0],
      track: async (purchase) => {
        events.push(purchase)
      },
    })

  const [left, right] = await Promise.all([run(), run()])
  const tracked = [left, right].filter((result) => result.status === 'tracked')
  assert.equal(tracked.length, 1)
  assert.equal(events.length, 1)
  assert.equal(events[0].price, priceForPlan('annual'))
})

test('an in-flight claim blocks a second reporter', async () => {
  const store = memoryStore()
  await store.writeClaim({ id: 'popup', plan: 'annual', at: NOW - 1_000 })
  const reserved = await reservePurchaseClaim(store, 'annual', NOW)
  assert.equal(reserved, null)

  const events: ReportedPurchase[] = []
  const result = await reportPaidPurchase({
    paidEventUser: user({ interval: 'year' }),
    baselinePlan: null,
    waitForChange: false,
    readUser: async () => user({ nickname: 'pro-yearly' }),
    sleep: async () => {},
    now: NOW,
    store,
    delays: [0],
    track: async (purchase) => {
      events.push(purchase)
    },
  })
  assert.equal(result.status, 'in_flight')
  assert.equal(events.length, 0)
})

test('the worker re-reads ExtPay and does not price a purchase from the checkout session', () => {
  const worker = readFileSync('src/services/extensionPayWorker.ts', 'utf8')
  assert.match(worker, /reportPaidPurchase/)
  assert.match(worker, /planFromExtPayUser/)
  assert.match(worker, /PURCHASE_PLAN_RETRY_DELAYS_MS/)
  assert.match(worker, /keepWorkerAlive/)
  assert.match(worker, /priceForPlan\(plan\)/)
  assert.match(worker, /proPurchasedProps/)
  assert.doesNotMatch(worker, /\?\? 'monthly'/)
  assert.doesNotMatch(worker, /session\?\.plan/)
  assert.doesNotMatch(worker, /purchaseTracked/)
})
