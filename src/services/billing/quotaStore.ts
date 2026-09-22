import { mergeQuotaRecords, type FillQuotaRecord } from './quota.ts'

export const FILL_QUOTA_KEY = 'fillQuota'

// Local is the source the content script reads. Sync is best-effort so a second
// signed-in Chrome profile on the same Google account keeps the monthly count.
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

export async function writeFillQuota(record: FillQuotaRecord): Promise<void> {
  await chrome.storage.local.set({ [FILL_QUOTA_KEY]: record })
  try {
    await chrome.storage.sync.set({ [FILL_QUOTA_KEY]: record })
  } catch {
    // Sync is optional (quota exceeded, disabled, or unsigned-in).
  }
}
