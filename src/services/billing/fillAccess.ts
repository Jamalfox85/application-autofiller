import { detectAts, type AtsPageContext } from '@/utils/ats'
import { readEntitlement } from './entitlementStore.ts'
import { fetchBillingState } from './client.ts'
import { applySuccessfulFill, decideFillWithRefresh, fillsRemaining, type FillQuotaRecord } from './quota.ts'
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
// it). The worker can. If it cannot, the local counter is the signed-out and
// offline fallback.
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

export interface FillAccess {
  decision: 'allow' | 'block'
  ats: string
  fillCount: number
  fillsRemaining: number
}

export async function evaluateFillAccess(ctx: AtsPageContext): Promise<FillAccess> {
  const ats = detectAts(ctx) ?? 'other'
  const [quota, entitlement] = await Promise.all([readQuotaForFill(), readEntitlement()])
  // getState re-reads ExtPay in the worker and rewrites the cached entitlement.
  const decision = await decideFillWithRefresh(
    { quota, isPro: entitlement.isPro, ats },
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
