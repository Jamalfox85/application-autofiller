import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  applySuccessfulFill,
  calendarWeekKey,
  clearedFillQuota,
  countFreeFillsInRange,
  decideFill,
  emptyQuota,
  localWeekRange,
  mergeQuotaForAccount,
  mergeQuotaRecords,
  mergeServerFillCount,
  type FillQuotaRecord,
} from './quota.ts'
import { FILL_QUOTA_KEY, dropFillQuotaCounter } from './quotaStore.ts'
import { decideQuotaClaim, quotaPageKey } from './quotaPage.ts'

const during = new Date(2026, 8, 16, 15, 0, 0)

function quota(overrides: Partial<FillQuotaRecord> = {}): FillQuotaRecord {
  return {
    ...emptyQuota(calendarWeekKey(during), { firstFillEver: true, greenhouseFillEver: true }),
    ...overrides,
  }
}

test('the local Monday week matches calendarWeekKey, including the year boundary', () => {
  const range = localWeekRange(during)
  assert.equal(range.start.getDay(), 1)
  assert.equal(calendarWeekKey(range.start), calendarWeekKey(during))
  assert.equal(calendarWeekKey(new Date(range.end.getTime() - 1)), calendarWeekKey(during))
  assert.notEqual(calendarWeekKey(range.end), calendarWeekKey(during))
  const hours = (range.end.getTime() - range.start.getTime()) / 36e5
  assert.ok(hours >= 167 && hours <= 169)

  // 2026-01-01 is a Thursday. That ISO week starts Monday 2025-12-29.
  const newYear = new Date(2026, 0, 1, 12, 0, 0)
  const yearWeek = localWeekRange(newYear)
  assert.equal(yearWeek.start.getFullYear(), 2025)
  assert.equal(yearWeek.start.getMonth(), 11)
  assert.equal(yearWeek.start.getDate(), 29)
  assert.equal(calendarWeekKey(yearWeek.start), calendarWeekKey(newYear))
  assert.notEqual(calendarWeekKey(yearWeek.end), calendarWeekKey(newYear))
})

test('a new week drops this device and the server count from the previous week', () => {
  const range = localWeekRange(during)
  const stored = quota({ successfulFills: 25, softPaywallShownForWeek: true, accountId: 'acct-a' })
  const rolled = mergeQuotaForAccount(stored, stored, 'acct-a', range.end, 'acct-a')
  assert.equal(rolled.successfulFills, 0)
  assert.equal(rolled.week, calendarWeekKey(range.end))
  assert.equal(rolled.softPaywallShownForWeek, false)
  assert.equal(rolled.firstFillEver, true)
  assert.equal(rolled.greenhouseFillEver, true)
  assert.equal(rolled.accountId, 'acct-a')

  const previousWeekFill = {
    occurredAt: during.getTime(),
    site: 'Lever · jobs.lever.co',
    countedTowardFreeQuota: true,
  }
  assert.equal(countFreeFillsInRange([previousWeekFill], range.start, range.end), 1)
  const next = localWeekRange(range.end)
  assert.equal(countFreeFillsInRange([previousWeekFill], next.start, next.end), 0)
})

test('server count 25 with an empty local counter blocks Greenhouse and Lever', () => {
  const week = calendarWeekKey(during)
  const local = mergeQuotaForAccount(emptyQuota(week), null, 'acct-a', during, null)
  assert.equal(local.successfulFills, 0)
  assert.equal(local.firstFillEver, false)
  assert.equal(local.greenhouseFillEver, false)

  const atCap = mergeServerFillCount(local, 25)
  assert.equal(atCap.successfulFills, 25)
  assert.equal(atCap.firstFillEver, true)
  assert.equal(atCap.greenhouseFillEver, true)
  assert.equal(decideFill({ quota: atCap, isPro: false, ats: 'greenhouse' }), 'block')
  assert.equal(decideFill({ quota: atCap, isPro: false, ats: 'lever' }), 'block')
  assert.equal(decideFill({ quota: atCap, isPro: false, ats: 'workday' }), 'allow')
  assert.equal(decideFill({ quota: atCap, isPro: true, ats: 'greenhouse' }), 'allow')
  assert.equal(decideFill({ quota: atCap, isPro: true, ats: 'lever' }), 'allow')

  // The same application was already counted this week. It still fills.
  assert.equal(
    decideFill({ quota: atCap, isPro: false, ats: 'greenhouse', alreadyCountedApplication: true }),
    'allow',
  )
  assert.equal(
    decideFill({ quota: atCap, isPro: false, ats: 'lever', alreadyCountedApplication: true }),
    'allow',
  )

  // Server unreachable: the empty local counter is the gate, and the first fill stays open.
  const offline = mergeServerFillCount(local, null)
  assert.equal(offline.successfulFills, 0)
  assert.equal(offline.greenhouseFillEver, false)
  assert.equal(decideFill({ quota: offline, isPro: false, ats: 'greenhouse' }), 'allow')
  assert.equal(decideFill({ quota: offline, isPro: false, ats: 'lever' }), 'allow')
})

test('a second device takes the server count and cannot drop below it', () => {
  const week = calendarWeekKey(during)
  const fresh = mergeQuotaForAccount(
    emptyQuota(week),
    null,
    'acct-a',
    during,
    null,
  )
  const fromServer = mergeServerFillCount(fresh, 18)
  assert.equal(fromServer.successfulFills, 18)
  assert.equal(fromServer.accountId, 'acct-a')
  assert.equal(fromServer.softPaywallShownForWeek, true)
  assert.equal(fromServer.firstFillEver, true)
  const atNine = mergeServerFillCount(fresh, 9)
  assert.equal(atNine.successfulFills, 9)
  assert.equal(atNine.firstFillEver, true)
  assert.equal(atNine.softPaywallShownForWeek, false)
  assert.equal(decideFill({ quota: fromServer, isPro: false, ats: 'lever' }), 'allow')

  const offlineAhead = mergeServerFillCount(quota({ successfulFills: 20, accountId: 'acct-a' }), 18)
  assert.equal(offlineAhead.successfulFills, 20)
  const serverDown = mergeServerFillCount(quota({ successfulFills: 6 }), null)
  assert.equal(serverDown.successfulFills, 6)
})

test('switching accounts on one browser drops the previous counter', async () => {
  const stored = quota({ successfulFills: 22, accountId: 'acct-a', softPaywallShownForWeek: true })
  const switched = mergeQuotaForAccount(stored, stored, 'acct-b', during, 'acct-a')
  assert.equal(switched.successfulFills, 0)
  assert.equal(switched.accountId, 'acct-b')
  assert.equal(switched.softPaywallShownForWeek, false)
  assert.equal(switched.firstFillEver, true)
  const withServer = mergeServerFillCount(switched, 4)
  assert.equal(withServer.successfulFills, 4)
  assert.equal(decideFill({ quota: withServer, isPro: false, ats: 'greenhouse' }), 'allow')

  const areas = {
    local: { [FILL_QUOTA_KEY]: stored } as Record<string, unknown>,
    sync: { [FILL_QUOTA_KEY]: stored } as Record<string, unknown>,
  }
  const area = (data: Record<string, unknown>) => ({
    async get(keys: string | string[]) {
      const list = Array.isArray(keys) ? keys : [keys]
      return Object.fromEntries(list.map((key) => [key, data[key]]))
    },
    async set(items: Record<string, unknown>) {
      Object.assign(data, items)
    },
  })
  const previous = (globalThis as { chrome?: unknown }).chrome
  ;(globalThis as { chrome?: unknown }).chrome = {
    storage: { local: area(areas.local), sync: area(areas.sync) },
  }
  try {
    await dropFillQuotaCounter(during, 'acct-a')
    const local = areas.local[FILL_QUOTA_KEY] as FillQuotaRecord
    const synced = areas.sync[FILL_QUOTA_KEY] as FillQuotaRecord
    assert.equal(local.successfulFills, 0)
    assert.equal(synced.successfulFills, 0)
    assert.equal(local.accountId, undefined)
    assert.equal(local.firstFillEver, true)
    assert.equal(
      mergeQuotaRecords(clearedFillQuota(stored), stored, during).successfulFills,
      0,
    )
  } finally {
    ;(globalThis as { chrome?: unknown }).chrome = previous
  }
})

test('Pro fills do not count and are not blocked; Workday still counts but is not stopped', () => {
  const atCap = quota({ successfulFills: 25 })
  assert.equal(decideFill({ quota: atCap, isPro: true, ats: 'greenhouse' }), 'allow')
  assert.equal(applySuccessfulFill(atCap, 'greenhouse', true).quota.successfulFills, 25)
  assert.equal(applySuccessfulFill(atCap, 'greenhouse', true).nudge, null)
  assert.equal(decideFill({ quota: atCap, isPro: false, ats: 'workday' }), 'allow')
  assert.equal(applySuccessfulFill(atCap, 'workday', false).quota.successfulFills, 26)

  const range = localWeekRange(during)
  const rows = [
    { occurredAt: during.getTime(), site: 'Greenhouse', countedTowardFreeQuota: false },
    { occurredAt: during.getTime(), site: 'Greenhouse', countedTowardFreeQuota: false },
    { occurredAt: during.getTime() + 5, site: 'Workday', countedTowardFreeQuota: true },
    { occurredAt: during.getTime() + 5, site: 'Workday', countedTowardFreeQuota: true },
    { occurredAt: range.start.getTime() - 1, site: 'Lever', countedTowardFreeQuota: true },
  ]
  assert.equal(countFreeFillsInRange(rows, range.start, range.end), 1)
})

test('signed-out counters still merge by max, and a same-application fill is not another row', () => {
  const local = quota({ successfulFills: 4 })
  const synced = quota({ successfulFills: 9 })
  const merged = mergeQuotaRecords(local, synced, during)
  assert.equal(merged.successfulFills, 9)
  assert.equal(merged.accountId, undefined)

  const week = calendarWeekKey(during)
  const firstKey = quotaPageKey('https://boards.greenhouse.io/acme/jobs/1')
  const steppedKey = quotaPageKey('https://boards.greenhouse.io/acme/jobs/1?step=2')
  assert.equal(firstKey, steppedKey)
  const first = decideQuotaClaim({}, firstKey, week)
  assert.equal(first.claimed, true)
  const again = decideQuotaClaim(first.claims, steppedKey, week)
  // The page key collapses the step, so the second fill is not claimed and is not inserted.
  assert.equal(again.claimed, false)
})

test('the account total is wired to the migration, the worker, and sign-out', () => {
  const sql = readFileSync(
    new URL('../../../supabase/migrations/20261011180000_fill_history_free_quota_week.sql', import.meta.url),
    'utf8',
  )
  assert.match(sql, /counted_toward_free_quota boolean not null default true/)
  assert.match(sql, /Existing rows/)
  assert.match(sql, /security definer/)
  assert.match(sql, /auth\.uid\(\)/)
  assert.match(sql, /set search_path = ''/)
  assert.match(sql, /select distinct h\.occurred_at, h\.site/)
  assert.match(
    sql,
    /revoke all on function public\.free_fills_this_week\(timestamptz, timestamptz\) from public, anon, service_role/,
  )
  assert.match(
    sql,
    /grant execute on function public\.free_fills_this_week\(timestamptz, timestamptz\) to authenticated/,
  )
  assert.doesNotMatch(
    sql,
    /grant execute on function public\.free_fills_this_week\(timestamptz, timestamptz\) to anon/,
  )
  assert.doesNotMatch(sql, /grant execute on function public\.free_fills_this_week\(timestamptz, timestamptz\) to public/)

  const history = readFileSync(new URL('../../lib/sync/fillHistory.ts', import.meta.url), 'utf8')
  const autofill = readFileSync(new URL('../../content/autofill.ts', import.meta.url), 'utf8')
  const worker = readFileSync(new URL('../extensionPayWorker.ts', import.meta.url), 'utf8')
  const auth = readFileSync(new URL('../../composables/useAuth.ts', import.meta.url), 'utf8')
  const background = readFileSync(new URL('../../../background.js', import.meta.url), 'utf8')
  const access = readFileSync(new URL('./fillAccess.ts', import.meta.url), 'utf8')

  assert.match(history, /counted_toward_free_quota: e\.countedTowardFreeQuota !== false/)
  assert.match(history, /isMissingFreeQuotaColumn/)
  assert.match(autofill, /countedTowardFreeQuota: lastCountedTowardFreeQuota/)
  assert.match(autofill, /if \(charged\) \{[\s\S]*await recordFillHistory\(filledCount, attemptedCount\)/)
  const readQuota = worker.slice(
    worker.indexOf("billingAction === 'readFillQuota'"),
    worker.indexOf("billingAction === 'getState'"),
  )
  assert.match(readQuota, /readAccountFillQuota/)
  assert.doesNotMatch(readQuota, /refreshEntitlement/)
  assert.match(worker, /readAccountFillQuota/)
  assert.match(auth, /await dropFillQuotaCounter\(\)/)
  assert.match(auth, /releaseFillQuotaOnAccountChange/)
  assert.match(background, /syncRecordedFill/)
  assert.match(access, /billingAction: 'readFillQuota'/)
  assert.match(access, /return readFillQuota\(\)/)
  assert.match(access, /action: 'fillQuotaCounted'/)
  assert.match(access, /alreadyCountedApplication/)
  assert.match(autofill, /alreadyCountedApplication: quotaCountedPages\.has\(pageKey\)/)
  assert.match(background, /request\.action === 'fillQuotaCounted'/)
  assert.match(background, /const counted = Boolean\(pageKey\) && claims\[pageKey\] === calendarWeekKey/)
})
