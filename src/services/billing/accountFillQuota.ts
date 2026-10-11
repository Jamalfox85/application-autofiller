import { getUserIdOrNull } from '../../lib/sync/shared.ts'
import { supabase } from '../../lib/supabase.ts'
import { withTimeout } from '../../utils/withTimeout.ts'
import { USER_ID_KEY } from './entitlementStore.ts'
import {
  localWeekRange,
  mergeQuotaForAccount,
  mergeServerFillCount,
  normalizeQuota,
  quotaAccountId,
  type FillQuotaRecord,
} from './quota.ts'
import { FILL_QUOTA_KEY, readFillQuota, writeFillQuota } from './quotaStore.ts'

const FREE_FILL_COUNT_RPC = 'free_fills_this_week'
const SERVER_COUNT_TIMEOUT_MS = 2500

function asCount(value: unknown): number | null {
  const count = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN
  if (!Number.isFinite(count) || count < 0) return null
  return Math.floor(count)
}

// Null when the RPC fails, the migration is not applied yet, or the caller is
// signed out. The JWT is the only identity; week bounds are the local Monday window.
async function fetchServerFreeFillCount(now: Date): Promise<number | null> {
  const { start, end } = localWeekRange(now)
  try {
    const { data, error } = await supabase.rpc(FREE_FILL_COUNT_RPC, {
      week_start: start.toISOString(),
      week_end: end.toISOString(),
    })
    if (error) return null
    return asCount(data)
  } catch {
    return null
  }
}

// Signed out: local + sync, same as before this account total existed.
// Signed in: max(local, this week's counted fill_history rows). A larger server
// total is written back so a later offline read cannot drop below it.
export async function readAccountFillQuota(now = new Date()): Promise<FillQuotaRecord> {
  try {
    const userId = await withTimeout(getUserIdOrNull(), SERVER_COUNT_TIMEOUT_MS, null)
    if (!userId) return readFillQuota(now)

    const [localBag, syncBag, billingBag] = await Promise.all([
      chrome.storage.local.get(FILL_QUOTA_KEY),
      chrome.storage.sync.get(FILL_QUOTA_KEY).catch(() => ({}) as Record<string, unknown>),
      chrome.storage.local.get(USER_ID_KEY),
    ])
    const billingUserId = typeof billingBag[USER_ID_KEY] === 'string' ? billingBag[USER_ID_KEY] : null
    const visible = mergeQuotaForAccount(
      localBag[FILL_QUOTA_KEY],
      syncBag[FILL_QUOTA_KEY],
      userId,
      now,
      billingUserId,
    )
    const serverCount = await withTimeout(fetchServerFreeFillCount(now), SERVER_COUNT_TIMEOUT_MS, null)
    const merged = mergeServerFillCount(visible, serverCount)
    merged.accountId = userId

    const stored = normalizeQuota(localBag[FILL_QUOTA_KEY], now)
    const changed =
      merged.successfulFills !== stored.successfulFills ||
      merged.softPaywallShownForWeek !== stored.softPaywallShownForWeek ||
      quotaAccountId(localBag[FILL_QUOTA_KEY]) !== userId
    if (changed) await writeFillQuota(merged)
    return merged
  } catch {
    return readFillQuota(now)
  }
}
