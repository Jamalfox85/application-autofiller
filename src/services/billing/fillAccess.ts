import { detectAts, type AtsPageContext } from '@/utils/ats'
import { readEntitlement } from './entitlementStore.ts'
import { fetchBillingState } from './client.ts'
import { applySuccessfulFill, decideFillWithRefresh, fillsRemaining, type FillQuotaRecord } from './quota.ts'
import { quotaPageKey } from './quotaPage.ts'
import { readFillQuota, writeFillQuota } from './quotaStore.ts'

function quotaFromWorker(value: unknown): FillQuotaRecord | null {
  if (!value || typeof value !== 'object') return null
  const quota = value as Partial<FillQuotaRecord>
  if (typeof quota.week !== 'string' || quota.week.length === 0) return null
  if (typeof quota.successfulFills !== 'number' || !Number.isFinite(quota.successfulFills)) return null
  const parsed: FillQuotaRecord = {
    week: quota.week,
    successfulFills: quota.successfulFills,
    firstFillEver: quota.firstFillEver === true,
    greenhouseFillEver: quota.greenhouseFillEver === true,
    softPaywallShownForWeek: quota.softPaywallShownForWeek === true,
  }
  if (typeof quota.accountId === 'string' && quota.accountId.length > 0) parsed.accountId = quota.accountId
  return parsed
}

// The content script cannot call Supabase on an apply page (the page CSP blocks
// it). The worker refreshes max(local, this week's server count) before the
// gate runs. If the worker or the server is unreachable, the local counter is
// the signed-out and offline fallback.
async function readQuotaForFill(): Promise<FillQuotaRecord> {
  try {
    const response = (await chrome.runtime.sendMessage({
      action: 'billing',
      billingAction: 'readFillQuota',
    })) as { ok?: boolean; quota?: unknown } | undefined
    const quota = response?.ok ? quotaFromWorker(response.quota) : null
    if (quota) return quota
  } catch {
    // Worker unreachable.
  }
  return readFillQuota()
}

// Session claims live in the worker, keyed by the tab URL, same as claimFillQuota.
// A miss (worker down, or this application was never counted) is not a repeat.
async function applicationAlreadyCounted(href: string | null | undefined): Promise<boolean> {
  const pageKey = quotaPageKey(href || '')
  if (!pageKey) return false
  try {
    const response = (await chrome.runtime.sendMessage({
      action: 'fillQuotaCounted',
      pageKey,
    })) as { ok?: boolean; counted?: boolean } | undefined
    return response?.ok === true && response.counted === true
  } catch {
    return false
  }
}

export interface FillAccess {
  decision: 'allow' | 'block'
  ats: string
  fillCount: number
  fillsRemaining: number
}

export async function evaluateFillAccess(
  ctx: AtsPageContext,
  options?: { alreadyCountedApplication?: boolean },
): Promise<FillAccess> {
  const ats = detectAts(ctx) ?? 'other'
  const [quota, entitlement, alreadyCounted] = await Promise.all([
    readQuotaForFill(),
    readEntitlement(),
    options?.alreadyCountedApplication ? Promise.resolve(true) : applicationAlreadyCounted(ctx.href),
  ])
  // getState re-reads ExtPay in the worker and rewrites the cached entitlement.
  const decision = await decideFillWithRefresh(
    { quota, isPro: entitlement.isPro, ats, alreadyCountedApplication: alreadyCounted },
    async () => (await fetchBillingState()).isPro,
  )
  return {
    decision,
    ats,
    fillCount: quota.successfulFills,
    fillsRemaining: fillsRemaining(quota.successfulFills),
  }
}

export async function commitSuccessfulFill(ats: string): Promise<{
  nudge: 'soft' | null
  fillCount: number
  fillsRemaining: number
  ats: string
  countedTowardFreeQuota: boolean
}> {
  const [quota, entitlement] = await Promise.all([readQuotaForFill(), readEntitlement()])
  const applied = applySuccessfulFill(quota, ats, entitlement.isPro)
  if (!entitlement.isPro) {
    await writeFillQuota(applied.quota)
  }
  return {
    nudge: applied.nudge,
    fillCount: applied.quota.successfulFills,
    fillsRemaining: fillsRemaining(applied.quota.successfulFills),
    ats,
    countedTowardFreeQuota: !entitlement.isPro,
  }
}
