import { detectAts, type AtsPageContext } from '@/utils/ats'
import { readEntitlement } from './entitlementStore.ts'
import { applySuccessfulFill, decideFill, fillsRemaining } from './quota.ts'
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
  const decision = decideFill({ quota, isPro: entitlement.isPro, ats })
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
