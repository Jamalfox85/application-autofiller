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
  return {
    week: record.week,
    successfulFills: typeof record.successfulFills === 'number' ? record.successfulFills : 0,
    firstFillEver: record.firstFillEver === true,
    greenhouseFillEver: record.greenhouseFillEver === true,
    softPaywallShownForWeek: record.softPaywallShownForWeek === true,
  }
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
  if (!parsed || parsed.week !== week) {
    return emptyQuota(week, lifetimeFlags(stored))
  }
  return parsed
}

export function mergeQuotaRecords(local: unknown, synced: unknown, now: Date): FillQuotaRecord {
  const a = normalizeQuota(local, now)
  const b = normalizeQuota(synced, now)
  return {
    week: a.week,
    successfulFills: Math.max(a.successfulFills, b.successfulFills),
    firstFillEver: a.firstFillEver || b.firstFillEver,
    greenhouseFillEver: a.greenhouseFillEver || b.greenhouseFillEver,
    softPaywallShownForWeek: a.softPaywallShownForWeek || b.softPaywallShownForWeek,
  }
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

  const wasFirstEver = !quota.firstFillEver
  const next: FillQuotaRecord = {
    ...quota,
    successfulFills: quota.successfulFills + 1,
    firstFillEver: true,
    greenhouseFillEver: quota.greenhouseFillEver || ats === 'greenhouse',
  }

  // Soft nudge once the week reaches fill #10. Never on fill #1. Never on Workday.
  // The fill is already committed; dismissing the nudge does not block it.
  // Copy is the locked "#10 / 15 left" creative, so we show it once per week.
  const showSoft =
    !wasFirstEver &&
    ats !== 'workday' &&
    next.successfulFills >= SOFT_GATE_AT &&
    next.successfulFills < FREE_FILL_LIMIT &&
    !next.softPaywallShownForWeek

  if (showSoft) next.softPaywallShownForWeek = true

  return { quota: next, nudge: showSoft ? 'soft' : null }
}
