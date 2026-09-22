import { FREE_FILL_LIMIT, SOFT_GATE_AT } from './plans.ts'

// One calendar month of successful autofills, plus lifetime flags that keep the
// first successful fill and the first Greenhouse success ungated.
export interface FillQuotaRecord {
  month: string
  successfulFills: number
  firstFillEver: boolean
  greenhouseFillEver: boolean
  softPaywallShownForMonth: boolean
}

export function calendarMonthKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${date.getFullYear()}-${month}`
}

export function emptyQuota(month: string, lifetime?: Pick<FillQuotaRecord, 'firstFillEver' | 'greenhouseFillEver'>): FillQuotaRecord {
  return {
    month,
    successfulFills: 0,
    firstFillEver: lifetime?.firstFillEver ?? false,
    greenhouseFillEver: lifetime?.greenhouseFillEver ?? false,
    softPaywallShownForMonth: false,
  }
}

function asRecord(value: unknown): FillQuotaRecord | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Partial<FillQuotaRecord>
  if (typeof record.month !== 'string') return null
  return {
    month: record.month,
    successfulFills: typeof record.successfulFills === 'number' ? record.successfulFills : 0,
    firstFillEver: record.firstFillEver === true,
    greenhouseFillEver: record.greenhouseFillEver === true,
    softPaywallShownForMonth: record.softPaywallShownForMonth === true,
  }
}

// A new month resets the counter and the soft-nudge flag. Lifetime "ever filled"
// flags survive so fill #1 of a later month is not treated as the install's first fill.
export function normalizeQuota(stored: unknown, now: Date): FillQuotaRecord {
  const parsed = asRecord(stored)
  const month = calendarMonthKey(now)
  if (!parsed || parsed.month !== month) {
    return emptyQuota(month, parsed ?? undefined)
  }
  return parsed
}

export function mergeQuotaRecords(local: unknown, synced: unknown, now: Date): FillQuotaRecord {
  const a = normalizeQuota(local, now)
  const b = normalizeQuota(synced, now)
  return {
    month: a.month,
    successfulFills: Math.max(a.successfulFills, b.successfulFills),
    firstFillEver: a.firstFillEver || b.firstFillEver,
    greenhouseFillEver: a.greenhouseFillEver || b.greenhouseFillEver,
    softPaywallShownForMonth: a.softPaywallShownForMonth || b.softPaywallShownForMonth,
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

  // Soft gate once the month reaches fill #10. Never on fill #1. Never on Workday.
  // Copy is the locked "#10 / 15 left" creative, so we show it once per month.
  const showSoft =
    !wasFirstEver &&
    ats !== 'workday' &&
    next.successfulFills >= SOFT_GATE_AT &&
    next.successfulFills < FREE_FILL_LIMIT &&
    !next.softPaywallShownForMonth

  if (showSoft) next.softPaywallShownForMonth = true

  return { quota: next, nudge: showSoft ? 'soft' : null }
}
