import { USER_ID_KEY } from './entitlementStore.ts'
import {
  clearedFillQuota,
  mergeQuotaRecords,
  normalizeQuota,
  quotaAccountId,
  type FillQuotaRecord,
} from './quota.ts'

export const FILL_QUOTA_KEY = 'fillQuota'

// Local is what a fill reads when the account service is unreachable. Sync is a
// best-effort copy. The signed-in weekly total comes from fill_history.
export async function readFillQuota(now = new Date()): Promise<FillQuotaRecord> {
  const local = await chrome.storage.local.get(FILL_QUOTA_KEY)
  let synced: unknown = null
  try {
    const data = await chrome.storage.sync.get(FILL_QUOTA_KEY)
    synced = data[FILL_QUOTA_KEY]
  } catch {
    synced = null
  }
  return mergeQuotaRecords(local[FILL_QUOTA_KEY], synced, now)
}

// Sign-out and an account change drop the weekly count so the next person on
// this browser does not inherit it. Lifetime ungating flags stay with the install.
// `onlyIfOwner` skips the drop when storage was already stamped for someone else
// (the new account's server total landed first).
export async function dropFillQuotaCounter(now = new Date(), onlyIfOwner?: string | null): Promise<void> {
  if (onlyIfOwner) {
    const stored = await chrome.storage.local.get(FILL_QUOTA_KEY)
    const owner = quotaAccountId(stored[FILL_QUOTA_KEY])
    if (owner && owner !== onlyIfOwner) return
  }
  const cleared = clearedFillQuota(normalizeQuota(await readFillQuota(now), now))
  await chrome.storage.local.set({ [FILL_QUOTA_KEY]: cleared })
  try {
    await chrome.storage.sync.set({ [FILL_QUOTA_KEY]: cleared })
  } catch {
    // Local is already cleared. A leftover sync copy stamped to the old account
    // is ignored by mergeQuotaRecords.
  }
}

// Popup opened onto a session that is not the user this counter was saved for.
export async function releaseFillQuotaOnAccountChange(nextUserId: string | null): Promise<void> {
  if (!nextUserId) return
  let billing: string | null = null
  let owner: string | null = null
  try {
    const data = await chrome.storage.local.get([FILL_QUOTA_KEY, USER_ID_KEY])
    billing = typeof data[USER_ID_KEY] === 'string' ? data[USER_ID_KEY] : null
    owner = quotaAccountId(data[FILL_QUOTA_KEY])
  } catch {
    return
  }
  const previous = billing || owner
  if (previous && previous !== nextUserId) await dropFillQuotaCounter(new Date(), previous)
}

export async function writeFillQuota(record: FillQuotaRecord): Promise<void> {
  await chrome.storage.local.set({ [FILL_QUOTA_KEY]: record })
  // The free counter is this local write. Awaiting sync here held History back: the
  // counter moved to 1 of 25 while trackAutofill was still waiting, and a hung sync
  // never recorded the row. Sync stays best-effort.
  void Promise.resolve(chrome.storage.sync.set({ [FILL_QUOTA_KEY]: record })).catch(() => {})
}
