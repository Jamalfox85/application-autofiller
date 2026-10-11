import { FREE_FILL_LIMIT, SOFT_GATE_AT } from './plans.ts'

// One calendar week of successful autofills (ISO week, Monday–Sunday), plus
// lifetime flags that keep the first successful fill and the first Greenhouse
// success ungated. The hard cap is 25 fills per week, not per month.
export interface FillQuotaRecord {
  week: string
  successfulFills: number
  firstFillEver: boolean
  greenhouseFillEver: boolean
  softPaywallShownForWeek: boolean
  // GoFillr user this counter belongs to. Absent on a signed-out counter and on
  // records saved before the count was per account.
  accountId?: string
}

// Local calendar date, then the ISO week of that date. Week 1 is the week
// that contains the year's first Thursday.
export function calendarWeekKey(date: Date): string {
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = utc.getUTCDay() || 7
  utc.setUTCDate(utc.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export function quotaAccountId(stored: unknown): string | null {
  if (!stored || typeof stored !== 'object') return null
  const id = (stored as { accountId?: unknown }).accountId
  return typeof id === 'string' && id.length > 0 ? id : null
}

// Monday 00:00 local through the next Monday 00:00 local. This is the window
// calendarWeekKey treats as one ISO week, including a week that crosses a year
// or a daylight-saving change. free_fills_this_week counts rows in this range.
export function localWeekRange(now: Date): { start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  const weekday = start.getDay() || 7
  start.setDate(start.getDate() - (weekday - 1))
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7, 0, 0, 0, 0)
  return { start, end }
}

export interface FreeFillRow {
  occurredAt: number
  site: string | null
  countedTowardFreeQuota?: boolean
}

// Mirrors free_fills_this_week: Pro rows are out, and two stored copies of the
// same fill (same instant and site) count once. A missing site matches a null site.
export function countFreeFillsInRange(rows: readonly FreeFillRow[], start: Date, end: Date): number {
  const startMs = start.getTime()
  const endMs = end.getTime()
  const seen = new Set<string>()
  for (const row of rows) {
    if (row.countedTowardFreeQuota === false) continue
    if (row.occurredAt < startMs || row.occurredAt >= endMs) continue
    seen.add(`${row.occurredAt}\0${row.site ?? ''}`)
  }
  return seen.size
}

export function clearedFillQuota(current: FillQuotaRecord): FillQuotaRecord {
  return emptyQuota(current.week, {
    firstFillEver: current.firstFillEver,
    greenhouseFillEver: current.greenhouseFillEver,
  })
}

export function emptyQuota(week: string, lifetime?: Pick<FillQuotaRecord, 'firstFillEver' | 'greenhouseFillEver'>): FillQuotaRecord {
  return {
    week,
    successfulFills: 0,
    firstFillEver: lifetime?.firstFillEver ?? false,
    greenhouseFillEver: lifetime?.greenhouseFillEver ?? false,
    softPaywallShownForWeek: false,
  }
}

function asRecord(value: unknown): FillQuotaRecord | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Partial<FillQuotaRecord>
  if (typeof record.week !== 'string' || record.week.length === 0) return null
  const parsed: FillQuotaRecord = {
    week: record.week,
    successfulFills: typeof record.successfulFills === 'number' ? record.successfulFills : 0,
    firstFillEver: record.firstFillEver === true,
    greenhouseFillEver: record.greenhouseFillEver === true,
    softPaywallShownForWeek: record.softPaywallShownForWeek === true,
  }
  const owner = quotaAccountId(value)
  if (owner) parsed.accountId = owner
  return parsed
}

function lifetimeFlags(value: unknown): Pick<FillQuotaRecord, 'firstFillEver' | 'greenhouseFillEver'> | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Partial<FillQuotaRecord> & { month?: unknown }
  const looksLikeQuota =
    typeof record.week === 'string' ||
    typeof record.month === 'string' ||
    typeof record.successfulFills === 'number'
  if (!looksLikeQuota) return undefined
  return {
    firstFillEver: record.firstFillEver === true,
    greenhouseFillEver: record.greenhouseFillEver === true,
  }
}

// A new week resets the counter and the soft-nudge flag. Lifetime "ever filled"
// flags survive, including records saved when the counter was still monthly, so
// fill #1 of a later week is not treated as the install's first fill.
export function normalizeQuota(stored: unknown, now: Date): FillQuotaRecord {
  const parsed = asRecord(stored)
  const week = calendarWeekKey(now)
  const owner = quotaAccountId(stored)
  if (!parsed || parsed.week !== week) {
    const fresh = emptyQuota(week, lifetimeFlags(stored))
    if (owner) fresh.accountId = owner
    return fresh
  }
  return parsed
}

export function mergeQuotaRecords(local: unknown, synced: unknown, now: Date): FillQuotaRecord {
  const a = normalizeQuota(local, now)
  const b = normalizeQuota(synced, now)
  const aOwner = a.accountId ?? null
  const bOwner = b.accountId ?? null
  // chrome.storage.sync can still hold the previous account after this profile
  // cleared its copy. That copy must not refill the counter.
  const syncIsOtherAccount = Boolean(bOwner && aOwner !== bOwner)
  const accountId = syncIsOtherAccount ? aOwner : aOwner || bOwner
  const merged: FillQuotaRecord = {
    week: a.week,
    successfulFills: syncIsOtherAccount ? a.successfulFills : Math.max(a.successfulFills, b.successfulFills),
    firstFillEver: a.firstFillEver || b.firstFillEver,
    greenhouseFillEver: a.greenhouseFillEver || b.greenhouseFillEver,
    softPaywallShownForWeek: syncIsOtherAccount
      ? a.softPaywallShownForWeek
      : a.softPaywallShownForWeek || b.softPaywallShownForWeek,
  }
  if (accountId) merged.accountId = accountId
  return merged
}

// Signed-in read. A counter stamped for someone else, or an unstamped counter
// left by a different billing user, contributes no fills. Lifetime "ever filled"
// flags still survive. The result is stamped for the reader.
export function mergeQuotaForAccount(
  local: unknown,
  synced: unknown,
  readerAccountId: string,
  now: Date,
  billingUserId?: string | null,
): FillQuotaRecord {
  const adopt = (stored: unknown): unknown => {
    if (stored == null) return stored
    const owner = quotaAccountId(stored)
    const quota = normalizeQuota(stored, now)
    const foreignOwner = Boolean(owner && owner !== readerAccountId)
    const foreignBilling = Boolean(
      !owner && billingUserId && billingUserId !== readerAccountId && quota.successfulFills > 0,
    )
    if (foreignOwner || foreignBilling) return clearedFillQuota(quota)
    return { ...quota, accountId: readerAccountId }
  }
  const merged = mergeQuotaRecords(adopt(local), adopt(synced), now)
  merged.accountId = readerAccountId
  return merged
}

// The database count is a floor. A device that filled while offline stays ahead
// until those rows sync; it never moves backward to a smaller server total.
export function mergeServerFillCount(local: FillQuotaRecord, serverCount: number | null): FillQuotaRecord {
  if (serverCount == null || !Number.isFinite(serverCount) || serverCount < 0) return local
  const count = Math.floor(serverCount)
  const next: FillQuotaRecord = {
    ...local,
    successfulFills: Math.max(local.successfulFills, count),
  }
  // A positive server count means this account has already filled. Leaving
  // firstFillEver false made the fill that reached 10 look like the install's
  // first fill, so the nudge waited until the next one (11 used, 14 left).
  // Clearing extension storage, or installing on a new browser, also resets the
  // flag. decideFill allows that "first" fill before it looks at the count, so
  // a free user already at 25 on the server would get another fill.
  if (count > 0) next.firstFillEver = true
  // The first Greenhouse success stays ungated when greenhouseFillEver is false.
  // A wiped local record is false even if this account already used the week.
  // At the cap, close that exemption too. Under the cap the flag can stay false:
  // the one Greenhouse fill is still allowed.
  if (count >= FREE_FILL_LIMIT) next.greenhouseFillEver = true
  // The soft nudge is once per week. A count that already passed 10 on another
  // device does not show "10 of 25" again on this one.
  if (count >= SOFT_GATE_AT) next.softPaywallShownForWeek = true
  return next
}

export function fillsRemaining(count: number): number {
  return Math.max(0, FREE_FILL_LIMIT - count)
}

export function decideFill(input: {
  quota: FillQuotaRecord
  isPro: boolean
  ats: string
}): 'allow' | 'block' {
  // Pro is unlimited autofills only. Resume AI and extra profiles have their own gates.
  if (input.isPro) return 'allow'
  // Workday stays free — never hard-stop and never show a Pro prompt for it.
  if (input.ats === 'workday') return 'allow'
  // Never gate the install's first successful autofill.
  if (!input.quota.firstFillEver) return 'allow'
  // First Greenhouse successful fill stays ungated even after the free cap.
  if (input.ats === 'greenhouse' && !input.quota.greenhouseFillEver) return 'allow'
  if (input.quota.successfulFills >= FREE_FILL_LIMIT) return 'block'
  return 'allow'
}

// The content script gates on the cached entitlement. Before a hard stop, ask
// ExtPay again so a purchase the cache has not seen yet does not block a fill.
export async function decideFillWithRefresh(
  input: { quota: FillQuotaRecord; isPro: boolean; ats: string },
  refreshIsPro: () => Promise<boolean>,
): Promise<'allow' | 'block'> {
  const decision = decideFill(input)
  if (decision === 'allow') return decision
  try {
    return (await refreshIsPro()) ? 'allow' : decision
  } catch {
    return decision
  }
}

export function applySuccessfulFill(
  quota: FillQuotaRecord,
  ats: string,
  isPro: boolean,
): { quota: FillQuotaRecord; nudge: 'soft' | null } {
  if (isPro) {
    return { quota, nudge: null }
  }

  const next: FillQuotaRecord = {
    ...quota,
    successfulFills: quota.successfulFills + 1,
    firstFillEver: true,
    greenhouseFillEver: quota.greenhouseFillEver || ats === 'greenhouse',
  }

  // The install's first successful fill is the one that moves the counter off 0.
  // A missing firstFillEver flag on a counter that is already 9 is not that fill:
  // treating it as first skipped the nudge at 10 and showed it on the next fill.
  // That next fill has already counted the in-flight one (11 used), so
  // 25 - 11 = 14 while the locked title still says 10 of 25. The label uses this
  // same post-increment count: 15 left when it first reaches 10.
  const fillingTheInstallsFirst = quota.successfulFills === 0 && !quota.firstFillEver

  // Soft nudge once the week reaches fill #10. Never on fill #1. Never on Workday.
  // The fill is already committed; dismissing the nudge does not block it.
  // Copy is the locked "10 of 25" title and "N fills left this week" continue
  // label. The count is the fills still left after this fill (15 at fill 10).
  // Shown once per week.
  const showSoft =
    !fillingTheInstallsFirst &&
    ats !== 'workday' &&
    next.successfulFills >= SOFT_GATE_AT &&
    next.successfulFills < FREE_FILL_LIMIT &&
    !next.softPaywallShownForWeek

  if (showSoft) next.softPaywallShownForWeek = true

  return { quota: next, nudge: showSoft ? 'soft' : null }
}
