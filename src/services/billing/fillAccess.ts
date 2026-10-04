import { detectAts, type AtsPageContext } from '@/utils/ats'
import { readEntitlement } from './entitlementStore.ts'
import { fetchBillingState } from './client.ts'
import { applySuccessfulFill, decideFillWithRefresh, fillsRemaining } from './quota.ts'
import { readFillQuota, writeFillQuota } from './quotaStore.ts'

export interface FillAccess {
  decision: 'allow' | 'block'
  ats: string
  fillCount: number
  fillsRemaining: number
}

export async function evaluateFillAccess(ctx: AtsPageContext): Promise<FillAccess> {
  const ats = detectAts(ctx) ?? 'other'
  const [quota, entitlement] = await Promise.all([readFillQuota(), readEntitlement()])
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
}> {
  const [quota, entitlement] = await Promise.all([readFillQuota(), readEntitlement()])
  const applied = applySuccessfulFill(quota, ats, entitlement.isPro)
  if (!entitlement.isPro) {
    await writeFillQuota(applied.quota)
  }
  return {
    nudge: applied.nudge,
    fillCount: applied.quota.successfulFills,
    fillsRemaining: fillsRemaining(applied.quota.successfulFills),
    ats,
  }
}
